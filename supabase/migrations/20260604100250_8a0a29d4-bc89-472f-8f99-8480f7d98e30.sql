DROP POLICY IF EXISTS memberships_select_self_or_admin ON public.club_memberships;
CREATE POLICY memberships_select_self_or_admin ON public.club_memberships
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_club_admin(auth.uid(), club_id)
    OR (
      status = 'approved'
      AND public.is_approved_member(auth.uid(), club_id)
    )
  );