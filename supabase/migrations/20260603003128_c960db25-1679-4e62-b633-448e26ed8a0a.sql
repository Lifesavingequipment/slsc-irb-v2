CREATE TABLE public.member_preferences (
  user_id uuid PRIMARY KEY,
  settings_section_order text[] NOT NULL DEFAULT '{}',
  notify_session_reminders boolean NOT NULL DEFAULT true,
  notify_new_sessions boolean NOT NULL DEFAULT true,
  notify_carpool_updates boolean NOT NULL DEFAULT true,
  notify_equipment boolean NOT NULL DEFAULT true,
  notify_join_requests boolean NOT NULL DEFAULT true,
  notify_fault_reports boolean NOT NULL DEFAULT true,
  notify_carpool_pending boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_preferences TO authenticated;
GRANT ALL ON public.member_preferences TO service_role;

ALTER TABLE public.member_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mp_select_self" ON public.member_preferences
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "mp_insert_self" ON public.member_preferences
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "mp_update_self" ON public.member_preferences
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "mp_delete_self" ON public.member_preferences
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER mp_touch_updated_at BEFORE UPDATE ON public.member_preferences
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();