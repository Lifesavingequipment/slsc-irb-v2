
ALTER TABLE public.equipment_lists
  ADD COLUMN IF NOT EXISTS event_name text,
  ADD COLUMN IF NOT EXISTS event_date date,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.equipment_list_items
  ADD COLUMN IF NOT EXISTS equipment_id uuid REFERENCES public.equipment(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS equipment_list_items_equipment_id_idx
  ON public.equipment_list_items(equipment_id);

CREATE INDEX IF NOT EXISTS equipment_lists_archived_at_idx
  ON public.equipment_lists(club_id, archived_at);
