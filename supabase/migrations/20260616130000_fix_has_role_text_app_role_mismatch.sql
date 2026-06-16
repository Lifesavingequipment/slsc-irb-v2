-- Fix "operator does not exist: text = app_role" raised when a member RSVPs.
--
-- club_roles.role (exposed via the public.user_roles view) is stored as TEXT,
-- but these SECURITY DEFINER helpers compared that column against an app_role
-- parameter (role = _role), which Postgres rejects. The rsvps_self_insert_gated
-- / rsvps_self_update_gated RLS policies call has_role(..., 'coach'::app_role),
-- so every member "Going" click failed.
--
-- Compare as text instead of casting the column to app_role: club_roles can
-- hold values that are NOT app_role enum labels (e.g. 'assistant_coach'), so a
-- column->enum cast would itself throw. is_club_admin already compares this
-- column as text, so this keeps the helpers consistent.

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _club_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role::text AND club_id = _club_id
  )
$function$;

CREATE OR REPLACE FUNCTION public.revoke_club_role(_user_id uuid, _club_id uuid, _role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_club_admin(auth.uid(), _club_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _role = 'owner' THEN RAISE EXCEPTION 'Owner role cannot be revoked'; END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND club_id = _club_id AND role = _role::text;
  INSERT INTO public.app_audit_log (actor_user_id, action, club_id, target_user_id, details)
    VALUES (auth.uid(), 'revoke_role', _club_id, _user_id, jsonb_build_object('role', _role::text));
END $function$;
