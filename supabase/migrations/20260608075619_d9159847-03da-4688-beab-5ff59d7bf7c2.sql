
ALTER TABLE public.coach_permissions
  ADD COLUMN IF NOT EXISTS manage_member_rsvps boolean NOT NULL DEFAULT false;

-- Existing rows: default the new permission to OFF (opt-in by club admin).
UPDATE public.coach_permissions SET manage_member_rsvps = false WHERE manage_member_rsvps IS NULL;

-- Extend coach_can to recognise the new permission key.
CREATE OR REPLACE FUNCTION public.coach_can(_user_id uuid, _club_id uuid, _perm text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v boolean;
BEGIN
  IF public.is_club_admin(_user_id, _club_id) THEN
    RETURN true;
  END IF;
  IF NOT public.has_role(_user_id, _club_id, 'coach') THEN
    RETURN false;
  END IF;
  SELECT
    CASE _perm
      WHEN 'manage_equipment'    THEN manage_equipment
      WHEN 'view_medical'        THEN view_medical
      WHEN 'view_emergency'      THEN view_emergency
      WHEN 'manage_attendance'   THEN manage_attendance
      WHEN 'manage_waves'        THEN manage_waves
      WHEN 'manage_documents'    THEN manage_documents
      WHEN 'manage_member_rsvps' THEN manage_member_rsvps
      ELSE false
    END
    INTO v
  FROM public.coach_permissions
  WHERE club_id = _club_id;
  -- manage_member_rsvps defaults to false when no row exists.
  IF _perm = 'manage_member_rsvps' THEN
    RETURN COALESCE(v, false);
  END IF;
  RETURN COALESCE(v, true);
END $function$;

-- Replace update_coach_permissions to accept the new flag.
DROP FUNCTION IF EXISTS public.update_coach_permissions(uuid, boolean, boolean, boolean, boolean, boolean, boolean);

CREATE OR REPLACE FUNCTION public.update_coach_permissions(
  _club_id uuid,
  _manage_equipment boolean,
  _view_medical boolean,
  _view_emergency boolean,
  _manage_attendance boolean,
  _manage_waves boolean,
  _manage_documents boolean,
  _manage_member_rsvps boolean
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_club_admin(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  INSERT INTO public.coach_permissions (
    club_id, manage_equipment, view_medical, view_emergency,
    manage_attendance, manage_waves, manage_documents, manage_member_rsvps,
    updated_at, updated_by
  ) VALUES (
    _club_id, _manage_equipment, _view_medical, _view_emergency,
    _manage_attendance, _manage_waves, _manage_documents, _manage_member_rsvps,
    now(), auth.uid()
  )
  ON CONFLICT (club_id) DO UPDATE SET
    manage_equipment    = excluded.manage_equipment,
    view_medical        = excluded.view_medical,
    view_emergency      = excluded.view_emergency,
    manage_attendance   = excluded.manage_attendance,
    manage_waves        = excluded.manage_waves,
    manage_documents    = excluded.manage_documents,
    manage_member_rsvps = excluded.manage_member_rsvps,
    updated_at = now(),
    updated_by = auth.uid();
  INSERT INTO public.audit_log (actor_user_id, action, club_id, details)
    VALUES (auth.uid(), 'update_coach_permissions', _club_id,
      jsonb_build_object(
        'manage_equipment', _manage_equipment,
        'view_medical', _view_medical,
        'view_emergency', _view_emergency,
        'manage_attendance', _manage_attendance,
        'manage_waves', _manage_waves,
        'manage_documents', _manage_documents,
        'manage_member_rsvps', _manage_member_rsvps
      ));
END $function$;

-- Replace session_rsvps coach/admin policies to honour the new permission.
DROP POLICY IF EXISTS rsvps_insert_coach_admin ON public.session_rsvps;
DROP POLICY IF EXISTS rsvps_update_coach_admin ON public.session_rsvps;
DROP POLICY IF EXISTS rsvps_delete_coach_admin ON public.session_rsvps;

CREATE POLICY rsvps_insert_coach_admin ON public.session_rsvps
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = session_rsvps.session_id
      AND (
        public.is_club_admin(auth.uid(), s.club_id)
        OR public.coach_can(auth.uid(), s.club_id, 'manage_member_rsvps')
      )
  ));

CREATE POLICY rsvps_update_coach_admin ON public.session_rsvps
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = session_rsvps.session_id
      AND (
        public.is_club_admin(auth.uid(), s.club_id)
        OR public.coach_can(auth.uid(), s.club_id, 'manage_member_rsvps')
      )
  ));

CREATE POLICY rsvps_delete_coach_admin ON public.session_rsvps
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = session_rsvps.session_id
      AND (
        public.is_club_admin(auth.uid(), s.club_id)
        OR public.coach_can(auth.uid(), s.club_id, 'manage_member_rsvps')
      )
  ));
