
REVOKE EXECUTE ON FUNCTION public.log_audit(text, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_sessions_trg() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_session_rsvps_trg() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_club_scoped_trg() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_equipment_list_items_trg() FROM PUBLIC, anon, authenticated;
