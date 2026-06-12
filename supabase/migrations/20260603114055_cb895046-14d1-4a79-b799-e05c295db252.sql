
-- 1. Coach permission toggles (club-wide)
CREATE TABLE IF NOT EXISTS public.coach_permissions (
  club_id uuid PRIMARY KEY,
  manage_equipment  boolean NOT NULL DEFAULT true,
  view_medical      boolean NOT NULL DEFAULT true,
  view_emergency    boolean NOT NULL DEFAULT true,
  manage_attendance boolean NOT NULL DEFAULT true,
  manage_waves      boolean NOT NULL DEFAULT true,
  manage_documents  boolean NOT NULL DEFAULT true,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid
);

GRANT SELECT, INSERT, UPDATE ON public.coach_permissions TO authenticated;
GRANT ALL ON public.coach_permissions TO service_role;

ALTER TABLE public.coach_permissions ENABLE ROW LEVEL SECURITY;

-- Any approved member can read (UI uses it for gating). Only admins/platform owners write.
CREATE POLICY cp_select ON public.coach_permissions
  FOR SELECT TO authenticated
  USING (public.is_approved_member(auth.uid(), club_id) OR public.is_club_admin(auth.uid(), club_id) OR public.is_platform_owner(auth.uid()));

CREATE POLICY cp_insert ON public.coach_permissions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_club_admin(auth.uid(), club_id) OR public.is_platform_owner(auth.uid()));

CREATE POLICY cp_update ON public.coach_permissions
  FOR UPDATE TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id) OR public.is_platform_owner(auth.uid()))
  WITH CHECK (public.is_club_admin(auth.uid(), club_id) OR public.is_platform_owner(auth.uid()));

-- Seed defaults for existing clubs
INSERT INTO public.coach_permissions (club_id)
SELECT id FROM public.clubs
ON CONFLICT (club_id) DO NOTHING;

-- 2. Audit log
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  club_id uuid,
  target_user_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_club_idx ON public.audit_log (club_id);

GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Platform owners see everything; club admins see entries for their club
CREATE POLICY audit_select ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    public.is_platform_owner(auth.uid())
    OR (club_id IS NOT NULL AND public.is_club_admin(auth.uid(), club_id))
  );

-- Only the security-definer RPCs below should insert; block direct client writes
CREATE POLICY audit_insert_none ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- 3. Extend is_club_admin so platform owners get global admin access
CREATE OR REPLACE FUNCTION public.is_club_admin(_user_id uuid, _club_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.is_platform_owner(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = _user_id
         AND club_id = _club_id
         AND role IN ('owner', 'club_admin')
    )
$$;

-- 4. coach_can: did the club enable this permission for coaches?
CREATE OR REPLACE FUNCTION public.coach_can(_user_id uuid, _club_id uuid, _perm text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
      WHEN 'manage_equipment'  THEN manage_equipment
      WHEN 'view_medical'      THEN view_medical
      WHEN 'view_emergency'    THEN view_emergency
      WHEN 'manage_attendance' THEN manage_attendance
      WHEN 'manage_waves'      THEN manage_waves
      WHEN 'manage_documents'  THEN manage_documents
      ELSE false
    END
    INTO v
  FROM public.coach_permissions
  WHERE club_id = _club_id;
  -- If no row exists, fall back to defaults (all true)
  RETURN COALESCE(v, true);
END $$;

-- 5. Ensure new clubs get a coach_permissions row
CREATE OR REPLACE FUNCTION public.handle_new_club()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, club_id, role) VALUES (NEW.created_by, NEW.id, 'owner')
      ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles (user_id, club_id, role) VALUES (NEW.created_by, NEW.id, 'club_admin')
      ON CONFLICT DO NOTHING;
    INSERT INTO public.club_memberships (user_id, club_id, status, approved_at, approved_by)
      VALUES (NEW.created_by, NEW.id, 'approved', now(), NEW.created_by)
      ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO public.coach_permissions (club_id) VALUES (NEW.id)
    ON CONFLICT (club_id) DO NOTHING;
  RETURN NEW;
END $$;

-- 6. Role assignment RPC (with audit). Cannot assign/revoke 'owner'.
CREATE OR REPLACE FUNCTION public.assign_club_role(_user_id uuid, _club_id uuid, _role app_role)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_club_admin(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF _role = 'owner' THEN
    RAISE EXCEPTION 'Owner role can only be granted by club creation';
  END IF;
  IF NOT public.is_approved_member(_user_id, _club_id) THEN
    RAISE EXCEPTION 'User is not an approved member of this club';
  END IF;
  INSERT INTO public.user_roles (user_id, club_id, role)
    VALUES (_user_id, _club_id, _role)
    ON CONFLICT DO NOTHING;
  INSERT INTO public.audit_log (actor_user_id, action, club_id, target_user_id, details)
    VALUES (auth.uid(), 'assign_role', _club_id, _user_id, jsonb_build_object('role', _role::text));
END $$;

CREATE OR REPLACE FUNCTION public.revoke_club_role(_user_id uuid, _club_id uuid, _role app_role)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_club_admin(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF _role = 'owner' THEN
    RAISE EXCEPTION 'Owner role cannot be revoked';
  END IF;
  DELETE FROM public.user_roles
   WHERE user_id = _user_id AND club_id = _club_id AND role = _role;
  INSERT INTO public.audit_log (actor_user_id, action, club_id, target_user_id, details)
    VALUES (auth.uid(), 'revoke_role', _club_id, _user_id, jsonb_build_object('role', _role::text));
END $$;

-- 7. Update coach_permissions RPC (with audit)
CREATE OR REPLACE FUNCTION public.update_coach_permissions(
  _club_id uuid,
  _manage_equipment boolean,
  _view_medical boolean,
  _view_emergency boolean,
  _manage_attendance boolean,
  _manage_waves boolean,
  _manage_documents boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_club_admin(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  INSERT INTO public.coach_permissions (
    club_id, manage_equipment, view_medical, view_emergency,
    manage_attendance, manage_waves, manage_documents, updated_at, updated_by
  ) VALUES (
    _club_id, _manage_equipment, _view_medical, _view_emergency,
    _manage_attendance, _manage_waves, _manage_documents, now(), auth.uid()
  )
  ON CONFLICT (club_id) DO UPDATE SET
    manage_equipment  = excluded.manage_equipment,
    view_medical      = excluded.view_medical,
    view_emergency    = excluded.view_emergency,
    manage_attendance = excluded.manage_attendance,
    manage_waves      = excluded.manage_waves,
    manage_documents  = excluded.manage_documents,
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
        'manage_documents', _manage_documents
      ));
END $$;

-- 8. Tighten coach RLS with coach_can() gates.
--    Admins (and platform owners) always pass via is_club_admin inside coach_can.

-- Medical info: coach access requires view_medical permission
DROP POLICY IF EXISTS mi_select ON public.member_medical_info;
CREATE POLICY mi_select ON public.member_medical_info
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.coach_can(auth.uid(), club_id, 'view_medical'));

DROP POLICY IF EXISTS mi_update ON public.member_medical_info;
CREATE POLICY mi_update ON public.member_medical_info
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.coach_can(auth.uid(), club_id, 'view_medical'))
  WITH CHECK (user_id = auth.uid() OR public.coach_can(auth.uid(), club_id, 'view_medical'));

DROP POLICY IF EXISTS mi_insert ON public.member_medical_info;
CREATE POLICY mi_insert ON public.member_medical_info
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = auth.uid() AND public.is_approved_member(auth.uid(), club_id))
    OR public.coach_can(auth.uid(), club_id, 'view_medical')
  );

DROP POLICY IF EXISTS mi_delete ON public.member_medical_info;
CREATE POLICY mi_delete ON public.member_medical_info
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.coach_can(auth.uid(), club_id, 'view_medical'));

-- Emergency contacts: coach access requires view_emergency permission
DROP POLICY IF EXISTS ec_select ON public.member_emergency_contacts;
CREATE POLICY ec_select ON public.member_emergency_contacts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.coach_can(auth.uid(), club_id, 'view_emergency'));

DROP POLICY IF EXISTS ec_update ON public.member_emergency_contacts;
CREATE POLICY ec_update ON public.member_emergency_contacts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.coach_can(auth.uid(), club_id, 'view_emergency'))
  WITH CHECK (user_id = auth.uid() OR public.coach_can(auth.uid(), club_id, 'view_emergency'));

DROP POLICY IF EXISTS ec_insert ON public.member_emergency_contacts;
CREATE POLICY ec_insert ON public.member_emergency_contacts
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = auth.uid() AND public.is_approved_member(auth.uid(), club_id))
    OR public.coach_can(auth.uid(), club_id, 'view_emergency')
  );

DROP POLICY IF EXISTS ec_delete ON public.member_emergency_contacts;
CREATE POLICY ec_delete ON public.member_emergency_contacts
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.coach_can(auth.uid(), club_id, 'view_emergency'));

-- Equipment: coach writes require manage_equipment permission
DROP POLICY IF EXISTS equipment_insert_coach_admin ON public.equipment;
CREATE POLICY equipment_insert_coach_admin ON public.equipment
  FOR INSERT TO authenticated
  WITH CHECK (public.coach_can(auth.uid(), club_id, 'manage_equipment'));

DROP POLICY IF EXISTS equipment_update_coach_admin ON public.equipment;
CREATE POLICY equipment_update_coach_admin ON public.equipment
  FOR UPDATE TO authenticated
  USING (public.coach_can(auth.uid(), club_id, 'manage_equipment'));

-- Equipment lists
DROP POLICY IF EXISTS el_insert ON public.equipment_lists;
CREATE POLICY el_insert ON public.equipment_lists
  FOR INSERT TO authenticated
  WITH CHECK (public.coach_can(auth.uid(), club_id, 'manage_equipment'));

DROP POLICY IF EXISTS el_update ON public.equipment_lists;
CREATE POLICY el_update ON public.equipment_lists
  FOR UPDATE TO authenticated
  USING (public.coach_can(auth.uid(), club_id, 'manage_equipment'));

DROP POLICY IF EXISTS el_delete ON public.equipment_lists;
CREATE POLICY el_delete ON public.equipment_lists
  FOR DELETE TO authenticated
  USING (public.coach_can(auth.uid(), club_id, 'manage_equipment'));

-- Equipment list items
DROP POLICY IF EXISTS eli_write ON public.equipment_list_items;
CREATE POLICY eli_write ON public.equipment_list_items
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.equipment_lists l
    WHERE l.id = list_id AND public.coach_can(auth.uid(), l.club_id, 'manage_equipment')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.equipment_lists l
    WHERE l.id = list_id AND public.coach_can(auth.uid(), l.club_id, 'manage_equipment')
  ));

-- Session attendance: coach writes require manage_attendance permission
DROP POLICY IF EXISTS attendance_insert_coach_admin ON public.session_attendance;
CREATE POLICY attendance_insert_coach_admin ON public.session_attendance
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = session_id AND public.coach_can(auth.uid(), s.club_id, 'manage_attendance')
  ));

DROP POLICY IF EXISTS attendance_update_coach_admin ON public.session_attendance;
CREATE POLICY attendance_update_coach_admin ON public.session_attendance
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = session_id AND public.coach_can(auth.uid(), s.club_id, 'manage_attendance')
  ));

DROP POLICY IF EXISTS attendance_delete_coach_admin ON public.session_attendance;
CREATE POLICY attendance_delete_coach_admin ON public.session_attendance
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = session_id AND public.coach_can(auth.uid(), s.club_id, 'manage_attendance')
  ));

-- Session teams / waves: coach writes require manage_waves permission
DROP POLICY IF EXISTS teams_insert_coach_admin ON public.session_teams;
CREATE POLICY teams_insert_coach_admin ON public.session_teams
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = session_id AND public.coach_can(auth.uid(), s.club_id, 'manage_waves')
  ));

DROP POLICY IF EXISTS teams_update_coach_admin ON public.session_teams;
CREATE POLICY teams_update_coach_admin ON public.session_teams
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = session_id AND public.coach_can(auth.uid(), s.club_id, 'manage_waves')
  ));

DROP POLICY IF EXISTS teams_delete_coach_admin ON public.session_teams;
CREATE POLICY teams_delete_coach_admin ON public.session_teams
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = session_id AND public.coach_can(auth.uid(), s.club_id, 'manage_waves')
  ));
