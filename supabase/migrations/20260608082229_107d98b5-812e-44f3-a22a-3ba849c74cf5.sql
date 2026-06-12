DROP POLICY IF EXISTS "carpools_insert_self" ON public.carpools;
CREATE POLICY "carpools_insert_member_or_manager" ON public.carpools
FOR INSERT TO authenticated
WITH CHECK (
  public.is_approved_member(driver_user_id, club_id)
  AND (
    driver_user_id = auth.uid()
    OR public.is_club_admin(auth.uid(), club_id)
    OR public.has_role(auth.uid(), club_id, 'coach'::app_role)
  )
);