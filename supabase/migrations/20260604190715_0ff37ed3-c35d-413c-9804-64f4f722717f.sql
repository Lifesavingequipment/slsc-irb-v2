CREATE TABLE public.equipment_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (club_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_categories TO authenticated;
GRANT ALL ON public.equipment_categories TO service_role;

ALTER TABLE public.equipment_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY ec_select ON public.equipment_categories FOR SELECT TO authenticated
  USING (public.is_approved_member(auth.uid(), club_id) OR public.is_club_admin(auth.uid(), club_id));

CREATE POLICY ec_insert ON public.equipment_categories FOR INSERT TO authenticated
  WITH CHECK (public.coach_can(auth.uid(), club_id, 'manage_equipment'));

CREATE POLICY ec_update ON public.equipment_categories FOR UPDATE TO authenticated
  USING (public.coach_can(auth.uid(), club_id, 'manage_equipment'))
  WITH CHECK (public.coach_can(auth.uid(), club_id, 'manage_equipment'));

CREATE POLICY ec_delete ON public.equipment_categories FOR DELETE TO authenticated
  USING (public.coach_can(auth.uid(), club_id, 'manage_equipment'));

CREATE TRIGGER equipment_categories_touch BEFORE UPDATE ON public.equipment_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX equipment_categories_club_idx ON public.equipment_categories(club_id, sort_order, name);

-- Seed categories per club from existing equipment.category values
INSERT INTO public.equipment_categories (club_id, name)
SELECT DISTINCT club_id, category
FROM public.equipment
WHERE category IS NOT NULL AND btrim(category) <> ''
ON CONFLICT DO NOTHING;