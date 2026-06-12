
-- Locations
CREATE TABLE public.locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO authenticated;
GRANT ALL ON public.locations TO service_role;

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY locations_select_members ON public.locations
  FOR SELECT TO authenticated
  USING (is_approved_member(auth.uid(), club_id) OR is_club_admin(auth.uid(), club_id));

CREATE POLICY locations_insert_coach_admin ON public.locations
  FOR INSERT TO authenticated
  WITH CHECK (is_club_admin(auth.uid(), club_id) OR has_role(auth.uid(), club_id, 'coach'::app_role));

CREATE POLICY locations_update_coach_admin ON public.locations
  FOR UPDATE TO authenticated
  USING (is_club_admin(auth.uid(), club_id) OR has_role(auth.uid(), club_id, 'coach'::app_role));

CREATE POLICY locations_delete_admin ON public.locations
  FOR DELETE TO authenticated
  USING (is_club_admin(auth.uid(), club_id));

CREATE TRIGGER locations_touch_updated_at
  BEFORE UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Session extensions
CREATE TYPE session_format AS ENUM ('team', 'individual');
CREATE TYPE repeat_frequency AS ENUM ('none', 'daily', 'weekly', 'fortnightly', 'monthly');

ALTER TABLE public.sessions
  ADD COLUMN format session_format NOT NULL DEFAULT 'team',
  ADD COLUMN repeat_frequency repeat_frequency NOT NULL DEFAULT 'none',
  ADD COLUMN survey_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN carpool_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN location_id UUID;
