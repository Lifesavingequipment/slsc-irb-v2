
-- 1. Equipment Lists
CREATE TABLE public.equipment_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_lists TO authenticated;
GRANT ALL ON public.equipment_lists TO service_role;
ALTER TABLE public.equipment_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY el_select ON public.equipment_lists FOR SELECT TO authenticated
  USING (is_approved_member(auth.uid(), club_id) OR is_club_admin(auth.uid(), club_id));
CREATE POLICY el_insert ON public.equipment_lists FOR INSERT TO authenticated
  WITH CHECK (is_club_admin(auth.uid(), club_id) OR has_role(auth.uid(), club_id, 'coach'::app_role));
CREATE POLICY el_update ON public.equipment_lists FOR UPDATE TO authenticated
  USING (is_club_admin(auth.uid(), club_id) OR has_role(auth.uid(), club_id, 'coach'::app_role));
CREATE POLICY el_delete ON public.equipment_lists FOR DELETE TO authenticated
  USING (is_club_admin(auth.uid(), club_id) OR has_role(auth.uid(), club_id, 'coach'::app_role));

CREATE TRIGGER trg_equipment_lists_touch BEFORE UPDATE ON public.equipment_lists
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Equipment List Items
CREATE TABLE public.equipment_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.equipment_lists(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Other',
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_list_items TO authenticated;
GRANT ALL ON public.equipment_list_items TO service_role;
ALTER TABLE public.equipment_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY eli_select ON public.equipment_list_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.equipment_lists l
    WHERE l.id = list_id AND (is_approved_member(auth.uid(), l.club_id) OR is_club_admin(auth.uid(), l.club_id))));
CREATE POLICY eli_write ON public.equipment_list_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.equipment_lists l
    WHERE l.id = list_id AND (is_club_admin(auth.uid(), l.club_id) OR has_role(auth.uid(), l.club_id, 'coach'::app_role))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.equipment_lists l
    WHERE l.id = list_id AND (is_club_admin(auth.uid(), l.club_id) OR has_role(auth.uid(), l.club_id, 'coach'::app_role))));

CREATE TRIGGER trg_equipment_list_items_touch BEFORE UPDATE ON public.equipment_list_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_eli_list_id ON public.equipment_list_items(list_id);

-- 3. Packed Status (shared per club)
CREATE TABLE public.equipment_list_packed (
  item_id uuid PRIMARY KEY REFERENCES public.equipment_list_items(id) ON DELETE CASCADE,
  packed_by uuid NOT NULL,
  packed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_list_packed TO authenticated;
GRANT ALL ON public.equipment_list_packed TO service_role;
ALTER TABLE public.equipment_list_packed ENABLE ROW LEVEL SECURITY;

CREATE POLICY elp_select ON public.equipment_list_packed FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.equipment_list_items i
    JOIN public.equipment_lists l ON l.id = i.list_id
    WHERE i.id = item_id AND (is_approved_member(auth.uid(), l.club_id) OR is_club_admin(auth.uid(), l.club_id))));
CREATE POLICY elp_write ON public.equipment_list_packed FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.equipment_list_items i
    JOIN public.equipment_lists l ON l.id = i.list_id
    WHERE i.id = item_id AND (is_approved_member(auth.uid(), l.club_id) OR is_club_admin(auth.uid(), l.club_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.equipment_list_items i
    JOIN public.equipment_lists l ON l.id = i.list_id
    WHERE i.id = item_id AND (is_approved_member(auth.uid(), l.club_id) OR is_club_admin(auth.uid(), l.club_id))));

-- 4. Extend equipment_faults to support club-level faults (not tied to a specific equipment row)
ALTER TABLE public.equipment_faults
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS equipment_name text,
  ADD COLUMN IF NOT EXISTS club_id uuid;

-- Backfill club_id from existing equipment links
UPDATE public.equipment_faults f
   SET club_id = e.club_id
  FROM public.equipment e
 WHERE f.equipment_id = e.id AND f.club_id IS NULL;

ALTER TABLE public.equipment_faults ALTER COLUMN equipment_id DROP NOT NULL;
ALTER TABLE public.equipment_faults ALTER COLUMN club_id SET NOT NULL;

-- Replace RLS policies to use club_id directly
DROP POLICY IF EXISTS faults_delete_admin ON public.equipment_faults;
DROP POLICY IF EXISTS faults_insert_members ON public.equipment_faults;
DROP POLICY IF EXISTS faults_select_members ON public.equipment_faults;
DROP POLICY IF EXISTS faults_update_coach_admin ON public.equipment_faults;

CREATE POLICY faults_select_members ON public.equipment_faults FOR SELECT TO authenticated
  USING (is_approved_member(auth.uid(), club_id) OR is_club_admin(auth.uid(), club_id));
CREATE POLICY faults_insert_members ON public.equipment_faults FOR INSERT TO authenticated
  WITH CHECK (reported_by = auth.uid()
    AND (is_approved_member(auth.uid(), club_id) OR is_club_admin(auth.uid(), club_id)));
CREATE POLICY faults_update_coach_admin ON public.equipment_faults FOR UPDATE TO authenticated
  USING (is_club_admin(auth.uid(), club_id) OR has_role(auth.uid(), club_id, 'coach'::app_role));
CREATE POLICY faults_delete_admin ON public.equipment_faults FOR DELETE TO authenticated
  USING (is_club_admin(auth.uid(), club_id));
