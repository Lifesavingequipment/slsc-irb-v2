
-- Enums
DO $$ BEGIN
  CREATE TYPE public.equipment_status AS ENUM ('active','retired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.fault_status AS ENUM ('open','repaired','cleared');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- equipment (master list per club)
CREATE TABLE IF NOT EXISTS public.equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  name text NOT NULL,
  category text,
  serial_number text,
  notes text,
  status public.equipment_status NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_equipment_club ON public.equipment(club_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment TO authenticated;
GRANT ALL ON public.equipment TO service_role;

ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY equipment_select_members ON public.equipment FOR SELECT TO authenticated
  USING (public.is_approved_member(auth.uid(), club_id) OR public.is_club_admin(auth.uid(), club_id));

CREATE POLICY equipment_insert_coach_admin ON public.equipment FOR INSERT TO authenticated
  WITH CHECK (public.is_club_admin(auth.uid(), club_id) OR public.has_role(auth.uid(), club_id, 'coach'::app_role));

CREATE POLICY equipment_update_coach_admin ON public.equipment FOR UPDATE TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id) OR public.has_role(auth.uid(), club_id, 'coach'::app_role));

CREATE POLICY equipment_delete_admin ON public.equipment FOR DELETE TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id));

CREATE TRIGGER trg_equipment_touch BEFORE UPDATE ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- session_equipment (checklist)
CREATE TABLE IF NOT EXISTS public.session_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  equipment_id uuid NOT NULL,
  checked boolean NOT NULL DEFAULT false,
  checked_by uuid,
  checked_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, equipment_id)
);
CREATE INDEX IF NOT EXISTS idx_session_equipment_session ON public.session_equipment(session_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_equipment TO authenticated;
GRANT ALL ON public.session_equipment TO service_role;

ALTER TABLE public.session_equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY session_equipment_select_members ON public.session_equipment FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id
    AND (public.is_approved_member(auth.uid(), s.club_id) OR public.is_club_admin(auth.uid(), s.club_id))));

CREATE POLICY session_equipment_insert_coach_admin ON public.session_equipment FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id
    AND (public.is_club_admin(auth.uid(), s.club_id) OR public.has_role(auth.uid(), s.club_id, 'coach'::app_role))));

CREATE POLICY session_equipment_update_coach_admin ON public.session_equipment FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id
    AND (public.is_club_admin(auth.uid(), s.club_id) OR public.has_role(auth.uid(), s.club_id, 'coach'::app_role))));

CREATE POLICY session_equipment_delete_coach_admin ON public.session_equipment FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id
    AND (public.is_club_admin(auth.uid(), s.club_id) OR public.has_role(auth.uid(), s.club_id, 'coach'::app_role))));

CREATE TRIGGER trg_session_equipment_touch BEFORE UPDATE ON public.session_equipment
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- equipment_faults
CREATE TABLE IF NOT EXISTS public.equipment_faults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL,
  reported_by uuid NOT NULL,
  description text NOT NULL,
  status public.fault_status NOT NULL DEFAULT 'open',
  resolution_notes text,
  resolved_by uuid,
  resolved_at timestamptz,
  reported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_equipment_faults_equipment ON public.equipment_faults(equipment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_faults TO authenticated;
GRANT ALL ON public.equipment_faults TO service_role;

ALTER TABLE public.equipment_faults ENABLE ROW LEVEL SECURITY;

-- Members can view faults for equipment in their club
CREATE POLICY faults_select_members ON public.equipment_faults FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.equipment e WHERE e.id = equipment_id
    AND (public.is_approved_member(auth.uid(), e.club_id) OR public.is_club_admin(auth.uid(), e.club_id))));

-- Any approved club member can report a fault (must be the reporter)
CREATE POLICY faults_insert_members ON public.equipment_faults FOR INSERT TO authenticated
  WITH CHECK (reported_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.equipment e WHERE e.id = equipment_id
      AND (public.is_approved_member(auth.uid(), e.club_id) OR public.is_club_admin(auth.uid(), e.club_id))));

-- Only coaches/admins can update fault status / resolve
CREATE POLICY faults_update_coach_admin ON public.equipment_faults FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.equipment e WHERE e.id = equipment_id
    AND (public.is_club_admin(auth.uid(), e.club_id) OR public.has_role(auth.uid(), e.club_id, 'coach'::app_role))));

CREATE POLICY faults_delete_admin ON public.equipment_faults FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.equipment e WHERE e.id = equipment_id
    AND public.is_club_admin(auth.uid(), e.club_id)));

CREATE TRIGGER trg_equipment_faults_touch BEFORE UPDATE ON public.equipment_faults
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
