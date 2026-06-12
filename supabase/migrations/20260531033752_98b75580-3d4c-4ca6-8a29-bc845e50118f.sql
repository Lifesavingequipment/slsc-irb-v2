-- Allow approved members to manage their own partner pairs (where they're driver or crew)
DROP POLICY IF EXISTS mp_insert ON public.member_partners;
DROP POLICY IF EXISTS mp_delete ON public.member_partners;
DROP POLICY IF EXISTS mp_update ON public.member_partners;

CREATE POLICY mp_insert ON public.member_partners
FOR INSERT TO authenticated
WITH CHECK (
  (is_club_admin(auth.uid(), club_id) OR has_role(auth.uid(), club_id, 'coach'::app_role))
  OR (
    is_approved_member(auth.uid(), club_id)
    AND (auth.uid() = driver_id OR auth.uid() = crew_id)
  )
);

CREATE POLICY mp_delete ON public.member_partners
FOR DELETE TO authenticated
USING (
  (is_club_admin(auth.uid(), club_id) OR has_role(auth.uid(), club_id, 'coach'::app_role))
  OR auth.uid() = driver_id OR auth.uid() = crew_id
);

CREATE POLICY mp_update ON public.member_partners
FOR UPDATE TO authenticated
USING (
  (is_club_admin(auth.uid(), club_id) OR has_role(auth.uid(), club_id, 'coach'::app_role))
  OR auth.uid() = driver_id OR auth.uid() = crew_id
);
