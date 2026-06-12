REVOKE EXECUTE ON FUNCTION public.is_platform_owner(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bootstrap_platform_owner() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.grant_platform_owner(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_platform_owner(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_platform_stats() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_platform_coaches() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_platform_owners() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_platform_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_platform_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_platform_owner(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_platform_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_platform_coaches() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_platform_owners() TO authenticated;