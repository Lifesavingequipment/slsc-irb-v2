
-- Member partner pairs (per club)
CREATE TABLE IF NOT EXISTS public.member_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  crew_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_partners_distinct CHECK (driver_id <> crew_id),
  CONSTRAINT member_partners_unique_driver UNIQUE (club_id, driver_id),
  CONSTRAINT member_partners_unique_crew UNIQUE (club_id, crew_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_partners TO authenticated;
GRANT ALL ON public.member_partners TO service_role;

ALTER TABLE public.member_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY mp_select ON public.member_partners FOR SELECT TO authenticated
  USING (is_approved_member(auth.uid(), club_id) OR is_club_admin(auth.uid(), club_id));
CREATE POLICY mp_insert ON public.member_partners FOR INSERT TO authenticated
  WITH CHECK (is_club_admin(auth.uid(), club_id) OR has_role(auth.uid(), club_id, 'coach'::app_role));
CREATE POLICY mp_update ON public.member_partners FOR UPDATE TO authenticated
  USING (is_club_admin(auth.uid(), club_id) OR has_role(auth.uid(), club_id, 'coach'::app_role));
CREATE POLICY mp_delete ON public.member_partners FOR DELETE TO authenticated
  USING (is_club_admin(auth.uid(), club_id) OR has_role(auth.uid(), club_id, 'coach'::app_role));

-- Trigger: ensure a user isn't in two pairs in the same club (cross-role)
CREATE OR REPLACE FUNCTION public.check_member_partner_unique()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.member_partners
    WHERE club_id = NEW.club_id
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND (driver_id = NEW.crew_id OR crew_id = NEW.driver_id)
  ) THEN
    RAISE EXCEPTION 'Member is already in another partner pair for this club';
  END IF;
  RETURN NEW;
END;$$;

CREATE TRIGGER trg_member_partner_unique
BEFORE INSERT OR UPDATE ON public.member_partners
FOR EACH ROW EXECUTE FUNCTION public.check_member_partner_unique();

CREATE TRIGGER trg_member_partners_touch
BEFORE UPDATE ON public.member_partners
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Per-session draw configuration (waves x lanes)
CREATE TABLE IF NOT EXISTS public.session_draw_configs (
  session_id uuid PRIMARY KEY REFERENCES public.sessions(id) ON DELETE CASCADE,
  waves_count int NOT NULL DEFAULT 3 CHECK (waves_count BETWEEN 1 AND 10),
  lanes_count int NOT NULL DEFAULT 4 CHECK (lanes_count BETWEEN 1 AND 8),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_draw_configs TO authenticated;
GRANT ALL ON public.session_draw_configs TO service_role;

ALTER TABLE public.session_draw_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY sdc_select ON public.session_draw_configs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id
    AND (is_approved_member(auth.uid(), s.club_id) OR is_club_admin(auth.uid(), s.club_id))));
CREATE POLICY sdc_write ON public.session_draw_configs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id
    AND (is_club_admin(auth.uid(), s.club_id) OR has_role(auth.uid(), s.club_id, 'coach'::app_role))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id
    AND (is_club_admin(auth.uid(), s.club_id) OR has_role(auth.uid(), s.club_id, 'coach'::app_role))));

CREATE TRIGGER trg_sdc_touch
BEFORE UPDATE ON public.session_draw_configs
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Ensure session_teams has a unique (session_id, wave, lane) slot
CREATE UNIQUE INDEX IF NOT EXISTS session_teams_slot_unique
  ON public.session_teams (session_id, wave, lane);
