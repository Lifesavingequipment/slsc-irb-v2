CREATE POLICY profiles_update_coach_admin ON public.profiles
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.club_memberships cm
  WHERE cm.user_id = profiles.id
    AND cm.status = 'approved'
    AND (public.is_club_admin(auth.uid(), cm.club_id)
         OR public.has_role(auth.uid(), cm.club_id, 'coach'::app_role))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.club_memberships cm
  WHERE cm.user_id = profiles.id
    AND cm.status = 'approved'
    AND (public.is_club_admin(auth.uid(), cm.club_id)
         OR public.has_role(auth.uid(), cm.club_id, 'coach'::app_role))
));