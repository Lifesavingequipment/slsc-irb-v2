
-- 1) Profile extensions
DO $$ BEGIN
  CREATE TYPE public.age_division AS ENUM ('u23','open','masters_35','masters_45');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS age_division public.age_division,
  ADD COLUMN IF NOT EXISTS preferred_roles text[] NOT NULL DEFAULT '{}';

-- 2) Allow multiple pairings per member
DROP TRIGGER IF EXISTS member_partners_unique_check ON public.member_partners;
DROP TRIGGER IF EXISTS check_member_partner_unique_trigger ON public.member_partners;
DROP FUNCTION IF EXISTS public.check_member_partner_unique() CASCADE;
-- Replace strict unique with pair-level uniqueness only (same driver+crew can't be duplicated)
CREATE UNIQUE INDEX IF NOT EXISTS member_partners_pair_unique
  ON public.member_partners (club_id, driver_id, crew_id);

-- 3) Event groups
DO $$ BEGIN
  CREATE TYPE public.event_type AS ENUM ('surf','mass','tube','teams','assembly','taplin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.session_event_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  event_type public.event_type NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_event_groups TO authenticated;
GRANT ALL ON public.session_event_groups TO service_role;
ALTER TABLE public.session_event_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY seg_select ON public.session_event_groups FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id
    AND (public.is_approved_member(auth.uid(), s.club_id) OR public.is_club_admin(auth.uid(), s.club_id))));
CREATE POLICY seg_insert ON public.session_event_groups FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id
    AND (public.is_club_admin(auth.uid(), s.club_id) OR public.has_role(auth.uid(), s.club_id, 'coach'::app_role))));
CREATE POLICY seg_update ON public.session_event_groups FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id
    AND (public.is_club_admin(auth.uid(), s.club_id) OR public.has_role(auth.uid(), s.club_id, 'coach'::app_role))));
CREATE POLICY seg_delete ON public.session_event_groups FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id
    AND (public.is_club_admin(auth.uid(), s.club_id) OR public.has_role(auth.uid(), s.club_id, 'coach'::app_role))));

-- 4) Entries
CREATE TABLE IF NOT EXISTS public.session_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.session_event_groups(id) ON DELETE CASCADE,
  entry_number int NOT NULL DEFAULT 1,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_entries TO authenticated;
GRANT ALL ON public.session_entries TO service_role;
ALTER TABLE public.session_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY se_select ON public.session_entries FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.session_event_groups g JOIN public.sessions s ON s.id = g.session_id
    WHERE g.id = group_id AND (public.is_approved_member(auth.uid(), s.club_id) OR public.is_club_admin(auth.uid(), s.club_id))));
CREATE POLICY se_write ON public.session_entries FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.session_event_groups g JOIN public.sessions s ON s.id = g.session_id
    WHERE g.id = group_id AND (public.is_club_admin(auth.uid(), s.club_id) OR public.has_role(auth.uid(), s.club_id, 'coach'::app_role))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.session_event_groups g JOIN public.sessions s ON s.id = g.session_id
    WHERE g.id = group_id AND (public.is_club_admin(auth.uid(), s.club_id) OR public.has_role(auth.uid(), s.club_id, 'coach'::app_role))));

-- 5) Entry positions
CREATE TABLE IF NOT EXISTS public.session_entry_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.session_entries(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('driver','crew','patient')),
  slot_index int NOT NULL DEFAULT 1,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, role, slot_index)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_entry_positions TO authenticated;
GRANT ALL ON public.session_entry_positions TO service_role;
ALTER TABLE public.session_entry_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY sep_select ON public.session_entry_positions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.session_entries e
    JOIN public.session_event_groups g ON g.id = e.group_id
    JOIN public.sessions s ON s.id = g.session_id
    WHERE e.id = entry_id AND (public.is_approved_member(auth.uid(), s.club_id) OR public.is_club_admin(auth.uid(), s.club_id))));
CREATE POLICY sep_write ON public.session_entry_positions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.session_entries e
    JOIN public.session_event_groups g ON g.id = e.group_id
    JOIN public.sessions s ON s.id = g.session_id
    WHERE e.id = entry_id AND (public.is_club_admin(auth.uid(), s.club_id) OR public.has_role(auth.uid(), s.club_id, 'coach'::app_role))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.session_entries e
    JOIN public.session_event_groups g ON g.id = e.group_id
    JOIN public.sessions s ON s.id = g.session_id
    WHERE e.id = entry_id AND (public.is_club_admin(auth.uid(), s.club_id) OR public.has_role(auth.uid(), s.club_id, 'coach'::app_role))));

-- touch triggers
CREATE TRIGGER seg_touch BEFORE UPDATE ON public.session_event_groups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER se_touch BEFORE UPDATE ON public.session_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER sep_touch BEFORE UPDATE ON public.session_entry_positions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
