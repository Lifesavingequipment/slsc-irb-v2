-- Session gear checklist (1/2): attach a reusable equipment list to a session.
-- Coaches pick a gear list per session; members then check items off in the
-- session's Gear tab. ON DELETE SET NULL so deleting a list doesn't break sessions.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS equipment_list_id uuid
  REFERENCES public.equipment_lists(id) ON DELETE SET NULL;
