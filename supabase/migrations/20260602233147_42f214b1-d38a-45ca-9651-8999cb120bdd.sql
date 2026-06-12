-- Carpool: coach setup fields on sessions
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS carpool_pickups text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS trailers_required integer NOT NULL DEFAULT 0;

-- Track whether a driver's vehicle can tow a trailer
ALTER TABLE public.carpools
  ADD COLUMN IF NOT EXISTS can_tow_trailer boolean NOT NULL DEFAULT false;

-- Club-owned vehicles (bus, van etc.) configured per session by coach
CREATE TABLE IF NOT EXISTS public.session_club_vehicles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL,
  club_id uuid NOT NULL,
  name text NOT NULL,
  seats integer NOT NULL DEFAULT 8,
  pickup_location text,
  can_tow boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_club_vehicles TO authenticated;
GRANT ALL ON public.session_club_vehicles TO service_role;

ALTER TABLE public.session_club_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY scv_select_members ON public.session_club_vehicles
  FOR SELECT TO authenticated
  USING (is_approved_member(auth.uid(), club_id) OR is_club_admin(auth.uid(), club_id));

CREATE POLICY scv_insert_coach_admin ON public.session_club_vehicles
  FOR INSERT TO authenticated
  WITH CHECK (is_club_admin(auth.uid(), club_id) OR has_role(auth.uid(), club_id, 'coach'::app_role));

CREATE POLICY scv_update_coach_admin ON public.session_club_vehicles
  FOR UPDATE TO authenticated
  USING (is_club_admin(auth.uid(), club_id) OR has_role(auth.uid(), club_id, 'coach'::app_role));

CREATE POLICY scv_delete_coach_admin ON public.session_club_vehicles
  FOR DELETE TO authenticated
  USING (is_club_admin(auth.uid(), club_id) OR has_role(auth.uid(), club_id, 'coach'::app_role));

CREATE TRIGGER scv_touch_updated BEFORE UPDATE ON public.session_club_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_session_club_vehicles_session ON public.session_club_vehicles(session_id);