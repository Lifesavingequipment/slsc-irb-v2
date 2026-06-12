
-- Tighten EXECUTE on SECURITY DEFINER functions: revoke from PUBLIC/anon, grant only where needed.

-- Trigger-only functions: revoke from everyone (triggers run regardless of grants)
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_membership_approved() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_club() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_carpool_capacity() FROM PUBLIC, anon, authenticated;

-- RLS helper functions and RPCs: revoke from PUBLIC/anon, grant only to authenticated
DO $$
DECLARE
  sig text;
  fns text[] := ARRAY[
    'public.is_club_admin(uuid, uuid)',
    'public.is_approved_member(uuid, uuid)',
    'public.has_role(uuid, uuid, public.app_role)',
    'public.is_platform_owner(uuid)',
    'public.coach_can(uuid, uuid, text)',
    'public.redeem_club_invite_code(text)',
    'public.grant_platform_owner(text)',
    'public.bootstrap_platform_owner()',
    'public.revoke_platform_owner(uuid)',
    'public.list_platform_owners()',
    'public.revoke_club_role(uuid, uuid, public.app_role)',
    'public.assign_club_role(uuid, uuid, public.app_role)',
    'public.get_platform_stats()',
    'public.list_platform_coaches()',
    'public.update_coach_permissions(uuid, boolean, boolean, boolean, boolean, boolean, boolean)'
  ];
BEGIN
  FOREACH sig IN ARRAY fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', sig);
  END LOOP;
END $$;
