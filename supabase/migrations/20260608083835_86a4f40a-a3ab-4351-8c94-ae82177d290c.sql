
-- 1. Session survey questions
CREATE TABLE public.session_survey_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  question_text text NOT NULL,
  question_type text NOT NULL DEFAULT 'yes_no' CHECK (question_type IN ('yes_no','text','single_choice')),
  options jsonb,
  required boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_survey_questions_session ON public.session_survey_questions(session_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_survey_questions TO authenticated;
GRANT ALL ON public.session_survey_questions TO service_role;
ALTER TABLE public.session_survey_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ssq_select_members" ON public.session_survey_questions FOR SELECT TO authenticated
  USING (public.is_approved_member(auth.uid(), club_id));
CREATE POLICY "ssq_insert_manager" ON public.session_survey_questions FOR INSERT TO authenticated
  WITH CHECK (public.is_club_admin(auth.uid(), club_id) OR public.has_role(auth.uid(), club_id, 'coach'));
CREATE POLICY "ssq_update_manager" ON public.session_survey_questions FOR UPDATE TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id) OR public.has_role(auth.uid(), club_id, 'coach'))
  WITH CHECK (public.is_club_admin(auth.uid(), club_id) OR public.has_role(auth.uid(), club_id, 'coach'));
CREATE POLICY "ssq_delete_manager" ON public.session_survey_questions FOR DELETE TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id) OR public.has_role(auth.uid(), club_id, 'coach'));
CREATE TRIGGER touch_session_survey_questions BEFORE UPDATE ON public.session_survey_questions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Session survey responses
CREATE TABLE public.session_survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.session_survey_questions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  answer_text text,
  answer_bool boolean,
  answer_choice text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, user_id)
);
CREATE INDEX idx_survey_responses_session_user ON public.session_survey_responses(session_id, user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_survey_responses TO authenticated;
GRANT ALL ON public.session_survey_responses TO service_role;
ALTER TABLE public.session_survey_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ssr_select_own_or_manager" ON public.session_survey_responses FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_club_admin(auth.uid(), club_id)
    OR public.coach_can(auth.uid(), club_id, 'view_survey_results')
  );
CREATE POLICY "ssr_insert_own" ON public.session_survey_responses FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_approved_member(auth.uid(), club_id));
CREATE POLICY "ssr_update_own" ON public.session_survey_responses FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "ssr_delete_own_or_manager" ON public.session_survey_responses FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_club_admin(auth.uid(), club_id));
CREATE TRIGGER touch_session_survey_responses BEFORE UPDATE ON public.session_survey_responses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Helper: has the user answered all required questions for the session?
CREATE OR REPLACE FUNCTION public.member_completed_pretraining_survey(_session_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.session_survey_questions q
    WHERE q.session_id = _session_id
      AND q.required = true
      AND NOT EXISTS (
        SELECT 1 FROM public.session_survey_responses r
        WHERE r.question_id = q.id
          AND r.user_id = _user_id
          AND (
            r.answer_text IS NOT NULL
            OR r.answer_bool IS NOT NULL
            OR r.answer_choice IS NOT NULL
          )
      )
  )
$function$;

-- 4. RSVP gating: drop old self insert/update policies and add gated ones.
-- We keep manager policies untouched. We must inspect existing policies and replace member-self ones.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'session_rsvps'
      AND policyname IN (
        'session_rsvps_insert_self', 'rsvps_insert_self',
        'session_rsvps_update_self', 'rsvps_update_self',
        'rsvps_self_insert', 'rsvps_self_update'
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON public.session_rsvps', r.policyname);
  END LOOP;
END $$;

-- Create gated self policies. Coaches/admins are not blocked because they bypass via manager policies (or, here, because they are not approved 'member' only — the gate applies to all self-RSVPs, which is fine since coaches/admins typically don't need to answer member surveys; if needed they can answer too).
CREATE POLICY "rsvps_self_insert_gated" ON public.session_rsvps FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_id
        AND public.is_approved_member(auth.uid(), s.club_id)
    )
    AND (
      public.is_club_admin(auth.uid(), (SELECT club_id FROM public.sessions WHERE id = session_id))
      OR public.has_role(auth.uid(), (SELECT club_id FROM public.sessions WHERE id = session_id), 'coach')
      OR public.member_completed_pretraining_survey(session_id, auth.uid())
    )
  );

CREATE POLICY "rsvps_self_update_gated" ON public.session_rsvps FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (
      public.is_club_admin(auth.uid(), (SELECT club_id FROM public.sessions WHERE id = session_id))
      OR public.has_role(auth.uid(), (SELECT club_id FROM public.sessions WHERE id = session_id), 'coach')
      OR public.member_completed_pretraining_survey(session_id, auth.uid())
    )
  );
