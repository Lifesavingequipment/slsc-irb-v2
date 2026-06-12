
-- 1. Session training plan (one per session)
CREATE TABLE public.session_training_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE REFERENCES public.sessions(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  overview text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_training_plans TO authenticated;
GRANT ALL ON public.session_training_plans TO service_role;
ALTER TABLE public.session_training_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stp_select_members" ON public.session_training_plans FOR SELECT TO authenticated
  USING (public.is_approved_member(auth.uid(), club_id));
CREATE POLICY "stp_insert_manager" ON public.session_training_plans FOR INSERT TO authenticated
  WITH CHECK (public.coach_can(auth.uid(), club_id, 'manage_training_plans'));
CREATE POLICY "stp_update_manager" ON public.session_training_plans FOR UPDATE TO authenticated
  USING (public.coach_can(auth.uid(), club_id, 'manage_training_plans'))
  WITH CHECK (public.coach_can(auth.uid(), club_id, 'manage_training_plans'));
CREATE POLICY "stp_delete_manager" ON public.session_training_plans FOR DELETE TO authenticated
  USING (public.coach_can(auth.uid(), club_id, 'manage_training_plans'));
CREATE TRIGGER touch_session_training_plans BEFORE UPDATE ON public.session_training_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Blocks within a plan
CREATE TABLE public.session_training_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.session_training_plans(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  duration_minutes integer,
  notes text,
  drill_id uuid REFERENCES public.training_drills(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_training_blocks_plan ON public.session_training_blocks(plan_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_training_blocks TO authenticated;
GRANT ALL ON public.session_training_blocks TO service_role;
ALTER TABLE public.session_training_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stb_select_members" ON public.session_training_blocks FOR SELECT TO authenticated
  USING (public.is_approved_member(auth.uid(), club_id));
CREATE POLICY "stb_insert_manager" ON public.session_training_blocks FOR INSERT TO authenticated
  WITH CHECK (public.coach_can(auth.uid(), club_id, 'manage_training_plans'));
CREATE POLICY "stb_update_manager" ON public.session_training_blocks FOR UPDATE TO authenticated
  USING (public.coach_can(auth.uid(), club_id, 'manage_training_plans'))
  WITH CHECK (public.coach_can(auth.uid(), club_id, 'manage_training_plans'));
CREATE POLICY "stb_delete_manager" ON public.session_training_blocks FOR DELETE TO authenticated
  USING (public.coach_can(auth.uid(), club_id, 'manage_training_plans'));
CREATE TRIGGER touch_session_training_blocks BEFORE UPDATE ON public.session_training_blocks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
