-- Session gear checklist (2/2): per-session check-off of gear list items.
-- Distinct from equipment_list_packed (which is per-list packing) and from the
-- legacy session_equipment table. Each session starts fresh: a row here means
-- "this list item has been checked for this session" by the given member.
CREATE TABLE IF NOT EXISTS public.session_gear_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  list_item_id uuid NOT NULL REFERENCES public.equipment_list_items(id) ON DELETE CASCADE,
  checked_by uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, list_item_id)
);

CREATE INDEX IF NOT EXISTS idx_session_gear_checks_session ON public.session_gear_checks(session_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_gear_checks TO authenticated;
GRANT ALL ON public.session_gear_checks TO service_role;

ALTER TABLE public.session_gear_checks ENABLE ROW LEVEL SECURITY;

-- Any approved member (or admin) of the session's club can view checks.
CREATE POLICY gear_checks_select_members ON public.session_gear_checks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id
    AND (public.is_approved_member(auth.uid(), s.club_id) OR public.is_club_admin(auth.uid(), s.club_id))));

-- Members check items off as themselves (checked_by must be their own member row).
CREATE POLICY gear_checks_insert_members ON public.session_gear_checks FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id
      AND (public.is_approved_member(auth.uid(), s.club_id) OR public.is_club_admin(auth.uid(), s.club_id)))
    AND EXISTS (SELECT 1 FROM public.members m WHERE m.id = checked_by AND m.auth_user_id = auth.uid())
  );

-- Anyone in the club can uncheck (delete) an item, even if someone else checked it.
CREATE POLICY gear_checks_delete_members ON public.session_gear_checks FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id
    AND (public.is_approved_member(auth.uid(), s.club_id) OR public.is_club_admin(auth.uid(), s.club_id))));

-- Realtime: full row on delete so the session_id filter matches delete events.
ALTER TABLE public.session_gear_checks REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'session_gear_checks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.session_gear_checks;
  END IF;
END $$;
