-- Platform owners: app-wide super-admins (separate from per-club owners)
CREATE TABLE IF NOT EXISTS public.platform_owners (
  user_id uuid PRIMARY KEY,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.platform_owners TO authenticated;
GRANT ALL ON public.platform_owners TO service_role;

ALTER TABLE public.platform_owners ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_owner(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_owners WHERE user_id = _user_id)
$$;

DROP POLICY IF EXISTS po_select ON public.platform_owners;
CREATE POLICY po_select ON public.platform_owners
  FOR SELECT TO authenticated
  USING (public.is_platform_owner(auth.uid()) OR user_id = auth.uid());

DROP POLICY IF EXISTS po_insert ON public.platform_owners;
CREATE POLICY po_insert ON public.platform_owners
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_owner(auth.uid()));

DROP POLICY IF EXISTS po_delete ON public.platform_owners;
CREATE POLICY po_delete ON public.platform_owners
  FOR DELETE TO authenticated
  USING (public.is_platform_owner(auth.uid()) AND user_id <> auth.uid());

-- One-time bootstrap: any club owner can self-promote IF no platform owner exists yet
CREATE OR REPLACE FUNCTION public.bootstrap_platform_owner()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.platform_owners) THEN
    RAISE EXCEPTION 'Already bootstrapped';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_user AND role = 'owner') THEN
    RAISE EXCEPTION 'Only a club owner can bootstrap';
  END IF;
  INSERT INTO public.platform_owners (user_id, granted_by) VALUES (v_user, v_user);
  RETURN v_user;
END $$;

-- Grant a platform owner role by email
CREATE OR REPLACE FUNCTION public.grant_platform_owner(_email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid;
BEGIN
  IF NOT public.is_platform_owner(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT id INTO v_user FROM public.profiles WHERE lower(email) = lower(trim(_email)) LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'No user with email %', _email; END IF;
  INSERT INTO public.platform_owners (user_id, granted_by)
    VALUES (v_user, auth.uid())
    ON CONFLICT (user_id) DO NOTHING;
  RETURN v_user;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_platform_owner(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_owner(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _user_id = auth.uid() THEN RAISE EXCEPTION 'Cannot remove yourself'; END IF;
  DELETE FROM public.platform_owners WHERE user_id = _user_id;
END $$;

-- Platform-wide stats (only platform owners)
CREATE OR REPLACE FUNCTION public.get_platform_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_platform_owner(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT jsonb_build_object(
    'platform_owners', (SELECT count(*) FROM public.platform_owners),
    'clubs',           (SELECT count(*) FROM public.clubs),
    'club_owners',     (SELECT count(DISTINCT user_id) FROM public.user_roles WHERE role = 'owner'),
    'club_admins',     (SELECT count(DISTINCT user_id) FROM public.user_roles WHERE role = 'club_admin'),
    'coaches',         (SELECT count(DISTINCT user_id) FROM public.user_roles WHERE role = 'coach'),
    'members',         (SELECT count(DISTINCT user_id) FROM public.club_memberships WHERE status = 'approved'),
    'pending_requests',(SELECT count(*) FROM public.club_memberships WHERE status = 'pending')
  ) INTO r;
  RETURN r;
END $$;

-- Coach directory across all clubs (for emailing)
CREATE OR REPLACE FUNCTION public.list_platform_coaches()
RETURNS TABLE(user_id uuid, full_name text, email text, club_id uuid, club_name text, role text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_owner(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN QUERY
  SELECT DISTINCT p.id, p.full_name, p.email, c.id, c.name, ur.role::text
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  JOIN public.clubs c ON c.id = ur.club_id
  WHERE ur.role IN ('owner','club_admin','coach')
    AND p.email IS NOT NULL
  ORDER BY c.name, p.full_name;
END $$;

-- Platform owners list with profile info
CREATE OR REPLACE FUNCTION public.list_platform_owners()
RETURNS TABLE(user_id uuid, full_name text, email text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_owner(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN QUERY
  SELECT po.user_id, p.full_name, p.email, po.created_at
  FROM public.platform_owners po
  LEFT JOIN public.profiles p ON p.id = po.user_id
  ORDER BY po.created_at;
END $$;