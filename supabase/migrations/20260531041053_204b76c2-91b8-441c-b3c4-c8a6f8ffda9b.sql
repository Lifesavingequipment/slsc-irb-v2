
-- 1. Profiles: only self or co-club members can read
DROP POLICY IF EXISTS profiles_select_all ON public.profiles;
CREATE POLICY profiles_select_self_or_co_member ON public.profiles
FOR SELECT TO authenticated USING (
  id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.club_memberships a
    JOIN public.club_memberships b ON b.club_id = a.club_id
    WHERE a.user_id = auth.uid()
      AND a.status = 'approved'
      AND b.user_id = profiles.id
      AND b.status = 'approved'
  )
);

-- 2. RSVP self-insert requires approved membership in that session's club
DROP POLICY IF EXISTS rsvps_insert_self ON public.session_rsvps;
CREATE POLICY rsvps_insert_self ON public.session_rsvps
FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = session_rsvps.session_id
      AND public.is_approved_member(auth.uid(), s.club_id)
  )
);

-- Also tighten self-update on RSVPs to require membership
DROP POLICY IF EXISTS rsvps_update_self ON public.session_rsvps;
CREATE POLICY rsvps_update_self ON public.session_rsvps
FOR UPDATE TO authenticated USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = session_rsvps.session_id
      AND public.is_approved_member(auth.uid(), s.club_id)
  )
);

-- 3. Block admins from granting the owner role
DROP POLICY IF EXISTS user_roles_insert_admin ON public.user_roles;
CREATE POLICY user_roles_insert_admin ON public.user_roles
FOR INSERT TO authenticated WITH CHECK (
  club_id IS NOT NULL
  AND public.is_club_admin(auth.uid(), club_id)
  AND role <> 'owner'::app_role
);

DROP POLICY IF EXISTS user_roles_update_admin ON public.user_roles;
CREATE POLICY user_roles_update_admin ON public.user_roles
FOR UPDATE TO authenticated
USING (club_id IS NOT NULL AND public.is_club_admin(auth.uid(), club_id) AND role <> 'owner'::app_role)
WITH CHECK (club_id IS NOT NULL AND public.is_club_admin(auth.uid(), club_id) AND role <> 'owner'::app_role);

-- 4. member_partners self-update requires approved membership
DROP POLICY IF EXISTS mp_update ON public.member_partners;
CREATE POLICY mp_update ON public.member_partners
FOR UPDATE TO authenticated USING (
  public.is_club_admin(auth.uid(), club_id)
  OR public.has_role(auth.uid(), club_id, 'coach'::app_role)
  OR (
    public.is_approved_member(auth.uid(), club_id)
    AND (auth.uid() = driver_id OR auth.uid() = crew_id)
  )
);

DROP POLICY IF EXISTS mp_delete ON public.member_partners;
CREATE POLICY mp_delete ON public.member_partners
FOR DELETE TO authenticated USING (
  public.is_club_admin(auth.uid(), club_id)
  OR public.has_role(auth.uid(), club_id, 'coach'::app_role)
  OR (
    public.is_approved_member(auth.uid(), club_id)
    AND (auth.uid() = driver_id OR auth.uid() = crew_id)
  )
);

-- 5. Set fixed search_path on touch_updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;

-- 6. Revoke EXECUTE from anon on internal security-definer helpers
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_club_admin(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_approved_member(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_club() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_membership_approved() FROM anon, authenticated, public;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_club_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approved_member(uuid, uuid) TO authenticated;
