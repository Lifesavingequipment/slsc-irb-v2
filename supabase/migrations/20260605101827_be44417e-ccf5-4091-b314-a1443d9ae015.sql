CREATE POLICY profiles_select_admin_pending
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.club_memberships cm
    WHERE cm.user_id = profiles.id
      AND (
        public.is_club_admin(auth.uid(), cm.club_id)
        OR public.has_role(auth.uid(), cm.club_id, 'coach'::app_role)
      )
  )
);