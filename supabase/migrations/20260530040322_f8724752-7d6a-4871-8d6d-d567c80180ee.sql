
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('owner', 'club_admin', 'coach', 'member');
CREATE TYPE public.membership_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.rsvp_status AS ENUM ('going', 'maybe', 'not_going');
CREATE TYPE public.session_type AS ENUM ('training', 'fitness', 'theory', 'other');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ CLUBS ============
CREATE TABLE public.clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT,
  logo_url TEXT,
  description TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clubs TO authenticated;
GRANT ALL ON public.clubs TO service_role;
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES (per club) ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id UUID REFERENCES public.clubs(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, club_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ CLUB MEMBERSHIPS ============
CREATE TABLE public.club_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  status public.membership_status NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(user_id, club_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_memberships TO authenticated;
GRANT ALL ON public.club_memberships TO service_role;
ALTER TABLE public.club_memberships ENABLE ROW LEVEL SECURITY;

-- ============ SECURITY DEFINER HELPERS ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _club_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
      AND (club_id = _club_id OR _club_id IS NULL OR club_id IS NULL)
  )
$$;

CREATE OR REPLACE FUNCTION public.is_club_admin(_user_id UUID, _club_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('owner', 'club_admin')
      AND (club_id = _club_id OR role = 'owner')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_approved_member(_user_id UUID, _club_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_memberships
    WHERE user_id = _user_id AND club_id = _club_id AND status = 'approved'
  )
$$;

-- ============ SESSIONS ============
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  session_type public.session_type NOT NULL DEFAULT 'training',
  location TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  capacity INT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO authenticated;
GRANT ALL ON public.sessions TO service_role;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_sessions_club_starts ON public.sessions(club_id, starts_at DESC);

-- ============ SESSION RSVPS ============
CREATE TABLE public.session_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.rsvp_status NOT NULL DEFAULT 'going',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_rsvps TO authenticated;
GRANT ALL ON public.session_rsvps TO service_role;
ALTER TABLE public.session_rsvps ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_rsvps_session ON public.session_rsvps(session_id);

-- ============ RLS POLICIES ============

-- profiles: anyone authenticated can read all profiles (needed for member lists); user updates self
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- clubs: any authenticated user can view & create; only club admins/owners can edit/delete
CREATE POLICY "clubs_select_all" ON public.clubs FOR SELECT TO authenticated USING (true);
CREATE POLICY "clubs_insert_authenticated" ON public.clubs FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "clubs_update_admin" ON public.clubs FOR UPDATE TO authenticated USING (public.is_club_admin(auth.uid(), id));
CREATE POLICY "clubs_delete_owner" ON public.clubs FOR DELETE TO authenticated USING (public.has_role(auth.uid(), id, 'owner'));

-- user_roles: users see own roles; admins see roles in their club
CREATE POLICY "user_roles_select_self_or_admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_club_admin(auth.uid(), club_id));

-- club_memberships
CREATE POLICY "memberships_select_self_or_admin" ON public.club_memberships FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_club_admin(auth.uid(), club_id));
CREATE POLICY "memberships_insert_self" ON public.club_memberships FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');
CREATE POLICY "memberships_update_admin" ON public.club_memberships FOR UPDATE TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id));
CREATE POLICY "memberships_delete_admin_or_self" ON public.club_memberships FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_club_admin(auth.uid(), club_id));

-- sessions: approved members can view; admins/coaches can manage
CREATE POLICY "sessions_select_members" ON public.sessions FOR SELECT TO authenticated
  USING (public.is_approved_member(auth.uid(), club_id) OR public.is_club_admin(auth.uid(), club_id));
CREATE POLICY "sessions_insert_coach_admin" ON public.sessions FOR INSERT TO authenticated
  WITH CHECK (
    public.is_club_admin(auth.uid(), club_id)
    OR public.has_role(auth.uid(), club_id, 'coach')
  );
CREATE POLICY "sessions_update_coach_admin" ON public.sessions FOR UPDATE TO authenticated
  USING (
    public.is_club_admin(auth.uid(), club_id)
    OR public.has_role(auth.uid(), club_id, 'coach')
  );
CREATE POLICY "sessions_delete_admin" ON public.sessions FOR DELETE TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id));

-- session_rsvps: visible to approved members of the session's club; users manage own rsvps
CREATE POLICY "rsvps_select_members" ON public.session_rsvps FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_id
        AND (public.is_approved_member(auth.uid(), s.club_id) OR public.is_club_admin(auth.uid(), s.club_id))
    )
  );
CREATE POLICY "rsvps_insert_self" ON public.session_rsvps FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "rsvps_update_self" ON public.session_rsvps FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "rsvps_delete_self" ON public.session_rsvps FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============ TRIGGERS ============

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'phone'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_clubs_touch BEFORE UPDATE ON public.clubs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_sessions_touch BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_rsvps_touch BEFORE UPDATE ON public.session_rsvps FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- When a club is created, make creator the owner & approved member
CREATE OR REPLACE FUNCTION public.handle_new_club()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, club_id, role) VALUES (NEW.created_by, NEW.id, 'owner')
      ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles (user_id, club_id, role) VALUES (NEW.created_by, NEW.id, 'club_admin')
      ON CONFLICT DO NOTHING;
    INSERT INTO public.club_memberships (user_id, club_id, status, approved_at, approved_by)
      VALUES (NEW.created_by, NEW.id, 'approved', now(), NEW.created_by)
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_club_created AFTER INSERT ON public.clubs FOR EACH ROW EXECUTE FUNCTION public.handle_new_club();

-- When membership is approved, ensure 'member' role exists
CREATE OR REPLACE FUNCTION public.handle_membership_approved()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    INSERT INTO public.user_roles (user_id, club_id, role) VALUES (NEW.user_id, NEW.club_id, 'member')
      ON CONFLICT DO NOTHING;
    NEW.approved_at = COALESCE(NEW.approved_at, now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_membership_status_change BEFORE UPDATE ON public.club_memberships
  FOR EACH ROW EXECUTE FUNCTION public.handle_membership_approved();
