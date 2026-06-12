
-- 1. Add new coach permissions columns
ALTER TABLE public.coach_permissions
  ADD COLUMN IF NOT EXISTS manage_templates boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manage_training_plans boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS view_survey_results boolean NOT NULL DEFAULT true;

-- 2. Update update_coach_permissions to accept the new fields
CREATE OR REPLACE FUNCTION public.update_coach_permissions(
  _club_id uuid,
  _manage_equipment boolean,
  _view_medical boolean,
  _view_emergency boolean,
  _manage_attendance boolean,
  _manage_waves boolean,
  _manage_documents boolean,
  _manage_member_rsvps boolean,
  _manage_templates boolean DEFAULT false,
  _manage_training_plans boolean DEFAULT true,
  _view_survey_results boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_club_admin(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  INSERT INTO public.coach_permissions (
    club_id, manage_equipment, view_medical, view_emergency,
    manage_attendance, manage_waves, manage_documents, manage_member_rsvps,
    manage_templates, manage_training_plans, view_survey_results,
    updated_at, updated_by
  ) VALUES (
    _club_id, _manage_equipment, _view_medical, _view_emergency,
    _manage_attendance, _manage_waves, _manage_documents, _manage_member_rsvps,
    _manage_templates, _manage_training_plans, _view_survey_results,
    now(), auth.uid()
  )
  ON CONFLICT (club_id) DO UPDATE SET
    manage_equipment      = excluded.manage_equipment,
    view_medical          = excluded.view_medical,
    view_emergency        = excluded.view_emergency,
    manage_attendance     = excluded.manage_attendance,
    manage_waves          = excluded.manage_waves,
    manage_documents      = excluded.manage_documents,
    manage_member_rsvps   = excluded.manage_member_rsvps,
    manage_templates      = excluded.manage_templates,
    manage_training_plans = excluded.manage_training_plans,
    view_survey_results   = excluded.view_survey_results,
    updated_at = now(),
    updated_by = auth.uid();
  INSERT INTO public.audit_log (actor_user_id, action, club_id, details)
    VALUES (auth.uid(), 'update_coach_permissions', _club_id,
      jsonb_build_object(
        'manage_equipment', _manage_equipment,
        'view_medical', _view_medical,
        'view_emergency', _view_emergency,
        'manage_attendance', _manage_attendance,
        'manage_waves', _manage_waves,
        'manage_documents', _manage_documents,
        'manage_member_rsvps', _manage_member_rsvps,
        'manage_templates', _manage_templates,
        'manage_training_plans', _manage_training_plans,
        'view_survey_results', _view_survey_results
      ));
END $function$;

-- 3. Extend coach_can to know about the new perms
CREATE OR REPLACE FUNCTION public.coach_can(_user_id uuid, _club_id uuid, _perm text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v boolean;
BEGIN
  IF public.is_club_admin(_user_id, _club_id) THEN
    RETURN true;
  END IF;
  IF NOT public.has_role(_user_id, _club_id, 'coach') THEN
    RETURN false;
  END IF;
  SELECT
    CASE _perm
      WHEN 'manage_equipment'      THEN manage_equipment
      WHEN 'view_medical'          THEN view_medical
      WHEN 'view_emergency'        THEN view_emergency
      WHEN 'manage_attendance'     THEN manage_attendance
      WHEN 'manage_waves'          THEN manage_waves
      WHEN 'manage_documents'      THEN manage_documents
      WHEN 'manage_member_rsvps'   THEN manage_member_rsvps
      WHEN 'manage_templates'      THEN manage_templates
      WHEN 'manage_training_plans' THEN manage_training_plans
      WHEN 'view_survey_results'   THEN view_survey_results
      ELSE false
    END
    INTO v
  FROM public.coach_permissions
  WHERE club_id = _club_id;
  -- These default to false when no row exists.
  IF _perm IN ('manage_member_rsvps', 'manage_templates') THEN
    RETURN COALESCE(v, false);
  END IF;
  RETURN COALESCE(v, true);
END $function$;

-- 4. Training drills catalogue
CREATE TABLE public.training_drills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  default_duration_minutes integer,
  tags text[] DEFAULT '{}'::text[],
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_drills TO authenticated;
GRANT ALL ON public.training_drills TO service_role;
ALTER TABLE public.training_drills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drills_select_members" ON public.training_drills FOR SELECT TO authenticated
  USING (public.is_approved_member(auth.uid(), club_id));
CREATE POLICY "drills_insert_manager" ON public.training_drills FOR INSERT TO authenticated
  WITH CHECK (public.coach_can(auth.uid(), club_id, 'manage_templates'));
CREATE POLICY "drills_update_manager" ON public.training_drills FOR UPDATE TO authenticated
  USING (public.coach_can(auth.uid(), club_id, 'manage_templates'))
  WITH CHECK (public.coach_can(auth.uid(), club_id, 'manage_templates'));
CREATE POLICY "drills_delete_manager" ON public.training_drills FOR DELETE TO authenticated
  USING (public.coach_can(auth.uid(), club_id, 'manage_templates'));
CREATE TRIGGER touch_training_drills BEFORE UPDATE ON public.training_drills
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. Carpool templates
CREATE TABLE public.carpool_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  -- vehicles: array of { vehicle_name, available_seats, can_tow_trailer, departure_location, notes }
  vehicles jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carpool_templates TO authenticated;
GRANT ALL ON public.carpool_templates TO service_role;
ALTER TABLE public.carpool_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "carpool_tpl_select_members" ON public.carpool_templates FOR SELECT TO authenticated
  USING (public.is_approved_member(auth.uid(), club_id));
CREATE POLICY "carpool_tpl_insert_manager" ON public.carpool_templates FOR INSERT TO authenticated
  WITH CHECK (public.coach_can(auth.uid(), club_id, 'manage_templates'));
CREATE POLICY "carpool_tpl_update_manager" ON public.carpool_templates FOR UPDATE TO authenticated
  USING (public.coach_can(auth.uid(), club_id, 'manage_templates'))
  WITH CHECK (public.coach_can(auth.uid(), club_id, 'manage_templates'));
CREATE POLICY "carpool_tpl_delete_manager" ON public.carpool_templates FOR DELETE TO authenticated
  USING (public.coach_can(auth.uid(), club_id, 'manage_templates'));
CREATE TRIGGER touch_carpool_templates BEFORE UPDATE ON public.carpool_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. Survey templates
CREATE TABLE public.survey_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  -- questions: array of { text, type ('yes_no'|'text'|'single_choice'), options?, required }
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.survey_templates TO authenticated;
GRANT ALL ON public.survey_templates TO service_role;
ALTER TABLE public.survey_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "survey_tpl_select_members" ON public.survey_templates FOR SELECT TO authenticated
  USING (public.is_approved_member(auth.uid(), club_id));
CREATE POLICY "survey_tpl_insert_manager" ON public.survey_templates FOR INSERT TO authenticated
  WITH CHECK (public.coach_can(auth.uid(), club_id, 'manage_templates'));
CREATE POLICY "survey_tpl_update_manager" ON public.survey_templates FOR UPDATE TO authenticated
  USING (public.coach_can(auth.uid(), club_id, 'manage_templates'))
  WITH CHECK (public.coach_can(auth.uid(), club_id, 'manage_templates'));
CREATE POLICY "survey_tpl_delete_manager" ON public.survey_templates FOR DELETE TO authenticated
  USING (public.coach_can(auth.uid(), club_id, 'manage_templates'));
CREATE TRIGGER touch_survey_templates BEFORE UPDATE ON public.survey_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 7. Training plan templates
CREATE TABLE public.training_plan_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  -- blocks: array of { title, duration_minutes, notes, drill_id? }
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_plan_templates TO authenticated;
GRANT ALL ON public.training_plan_templates TO service_role;
ALTER TABLE public.training_plan_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan_tpl_select_members" ON public.training_plan_templates FOR SELECT TO authenticated
  USING (public.is_approved_member(auth.uid(), club_id));
CREATE POLICY "plan_tpl_insert_manager" ON public.training_plan_templates FOR INSERT TO authenticated
  WITH CHECK (public.coach_can(auth.uid(), club_id, 'manage_templates'));
CREATE POLICY "plan_tpl_update_manager" ON public.training_plan_templates FOR UPDATE TO authenticated
  USING (public.coach_can(auth.uid(), club_id, 'manage_templates'))
  WITH CHECK (public.coach_can(auth.uid(), club_id, 'manage_templates'));
CREATE POLICY "plan_tpl_delete_manager" ON public.training_plan_templates FOR DELETE TO authenticated
  USING (public.coach_can(auth.uid(), club_id, 'manage_templates'));
CREATE TRIGGER touch_training_plan_templates BEFORE UPDATE ON public.training_plan_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
