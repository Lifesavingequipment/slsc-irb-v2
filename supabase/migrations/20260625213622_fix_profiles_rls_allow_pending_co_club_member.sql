-- Fix: allow approved club members to view profiles of co-club members
-- regardless of the target's membership_status (e.g. pending).
-- Previously both viewer and target needed status = 'approved', which
-- broke direct profile lookups (e.g. training partner notification deep
-- links) when the target was still pending approval.
-- The membership_status filter for directory listings is applied in
-- JavaScript on the client, not here.
DROP POLICY IF EXISTS profiles_select_self_or_co_member ON public.profiles;
CREATE POLICY profiles_select_self_or_co_member ON public.profiles
FOR SELECT TO authenticated USING (
  id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.club_memberships a
    JOIN public.club_memberships b ON b.club_id = a.club_id
    WHERE a.user_id = auth.uid()
      AND a.status = 'approved'
      AND b.user_id = profiles.id
  )
);
