CREATE POLICY notifications_update ON public.notifications
FOR UPDATE
USING (
  (member_id IN (SELECT members.id FROM members WHERE members.auth_user_id = auth.uid()))
  OR is_platform_owner(auth.uid())
)
WITH CHECK (
  (member_id IN (SELECT members.id FROM members WHERE members.auth_user_id = auth.uid()))
  OR is_platform_owner(auth.uid())
);
