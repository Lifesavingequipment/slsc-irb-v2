
-- 1. Add RSVP deadline
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS rsvp_deadline timestamptz;

-- 2. Attendance enum
DO $$ BEGIN
  CREATE TYPE public.attendance_status AS ENUM ('present','absent','excused');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. session_teams (IRB wave/lane allocation)
CREATE TABLE IF NOT EXISTS public.session_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  wave int NOT NULL DEFAULT 1,
  lane int NOT NULL DEFAULT 1,
  driver_id uuid,
  crew_id uuid,
  patient_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, wave, lane)
);
CREATE INDEX IF NOT EXISTS idx_session_teams_session ON public.session_teams(session_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_teams TO authenticated;
GRANT ALL ON public.session_teams TO service_role;

ALTER TABLE public.session_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY teams_select_members ON public.session_teams FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id
    AND (public.is_approved_member(auth.uid(), s.club_id) OR public.is_club_admin(auth.uid(), s.club_id))));

CREATE POLICY teams_insert_coach_admin ON public.session_teams FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id
    AND (public.is_club_admin(auth.uid(), s.club_id) OR public.has_role(auth.uid(), s.club_id, 'coach'::app_role))));

CREATE POLICY teams_update_coach_admin ON public.session_teams FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id
    AND (public.is_club_admin(auth.uid(), s.club_id) OR public.has_role(auth.uid(), s.club_id, 'coach'::app_role))));

CREATE POLICY teams_delete_coach_admin ON public.session_teams FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id
    AND (public.is_club_admin(auth.uid(), s.club_id) OR public.has_role(auth.uid(), s.club_id, 'coach'::app_role))));

CREATE TRIGGER trg_session_teams_touch BEFORE UPDATE ON public.session_teams
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. session_attendance
CREATE TABLE IF NOT EXISTS public.session_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status public.attendance_status NOT NULL,
  marked_by uuid,
  marked_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_session_attendance_session ON public.session_attendance(session_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_attendance TO authenticated;
GRANT ALL ON public.session_attendance TO service_role;

ALTER TABLE public.session_attendance ENABLE ROW LEVEL SECURITY;

-- Members can view attendance for sessions in their club; their own row always visible
CREATE POLICY attendance_select_members ON public.session_attendance FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id
    AND (public.is_approved_member(auth.uid(), s.club_id) OR public.is_club_admin(auth.uid(), s.club_id))));

CREATE POLICY attendance_insert_coach_admin ON public.session_attendance FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id
    AND (public.is_club_admin(auth.uid(), s.club_id) OR public.has_role(auth.uid(), s.club_id, 'coach'::app_role))));

CREATE POLICY attendance_update_coach_admin ON public.session_attendance FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id
    AND (public.is_club_admin(auth.uid(), s.club_id) OR public.has_role(auth.uid(), s.club_id, 'coach'::app_role))));

CREATE POLICY attendance_delete_coach_admin ON public.session_attendance FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id
    AND (public.is_club_admin(auth.uid(), s.club_id) OR public.has_role(auth.uid(), s.club_id, 'coach'::app_role))));

CREATE TRIGGER trg_session_attendance_touch BEFORE UPDATE ON public.session_attendance
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
