-- 1. Extend profiles with first/last name + DOB
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS email text;

-- 2. Emergency contacts (multiple per member, scoped to a club)
CREATE TABLE IF NOT EXISTS public.member_emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  club_id uuid NOT NULL,
  name text NOT NULL,
  relationship text,
  phone text NOT NULL,
  email text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_emergency_contacts TO authenticated;
GRANT ALL ON public.member_emergency_contacts TO service_role;

ALTER TABLE public.member_emergency_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY ec_select ON public.member_emergency_contacts FOR SELECT TO authenticated
  USING (user_id = auth.uid()
    OR is_club_admin(auth.uid(), club_id)
    OR has_role(auth.uid(), club_id, 'coach'::app_role));

CREATE POLICY ec_insert ON public.member_emergency_contacts FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid() AND is_approved_member(auth.uid(), club_id))
    OR is_club_admin(auth.uid(), club_id)
    OR has_role(auth.uid(), club_id, 'coach'::app_role));

CREATE POLICY ec_update ON public.member_emergency_contacts FOR UPDATE TO authenticated
  USING (user_id = auth.uid()
    OR is_club_admin(auth.uid(), club_id)
    OR has_role(auth.uid(), club_id, 'coach'::app_role))
  WITH CHECK (user_id = auth.uid()
    OR is_club_admin(auth.uid(), club_id)
    OR has_role(auth.uid(), club_id, 'coach'::app_role));

CREATE POLICY ec_delete ON public.member_emergency_contacts FOR DELETE TO authenticated
  USING (user_id = auth.uid()
    OR is_club_admin(auth.uid(), club_id)
    OR has_role(auth.uid(), club_id, 'coach'::app_role));

CREATE TRIGGER ec_touch BEFORE UPDATE ON public.member_emergency_contacts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS ec_user_club_idx ON public.member_emergency_contacts(user_id, club_id);

-- 3. Medical info (one row per user+club)
CREATE TABLE IF NOT EXISTS public.member_medical_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  club_id uuid NOT NULL,
  blood_type text,
  allergies text,
  medications text,
  conditions text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, club_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_medical_info TO authenticated;
GRANT ALL ON public.member_medical_info TO service_role;

ALTER TABLE public.member_medical_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY mi_select ON public.member_medical_info FOR SELECT TO authenticated
  USING (user_id = auth.uid()
    OR is_club_admin(auth.uid(), club_id)
    OR has_role(auth.uid(), club_id, 'coach'::app_role));

CREATE POLICY mi_insert ON public.member_medical_info FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid() AND is_approved_member(auth.uid(), club_id))
    OR is_club_admin(auth.uid(), club_id)
    OR has_role(auth.uid(), club_id, 'coach'::app_role));

CREATE POLICY mi_update ON public.member_medical_info FOR UPDATE TO authenticated
  USING (user_id = auth.uid()
    OR is_club_admin(auth.uid(), club_id)
    OR has_role(auth.uid(), club_id, 'coach'::app_role))
  WITH CHECK (user_id = auth.uid()
    OR is_club_admin(auth.uid(), club_id)
    OR has_role(auth.uid(), club_id, 'coach'::app_role));

CREATE POLICY mi_delete ON public.member_medical_info FOR DELETE TO authenticated
  USING (user_id = auth.uid()
    OR is_club_admin(auth.uid(), club_id)
    OR has_role(auth.uid(), club_id, 'coach'::app_role));

CREATE TRIGGER mi_touch BEFORE UPDATE ON public.member_medical_info
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();