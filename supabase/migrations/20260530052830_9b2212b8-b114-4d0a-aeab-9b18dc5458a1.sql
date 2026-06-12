-- =========================================================
-- 1. Foreign keys to public.profiles(id) — idempotent
-- =========================================================
DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT * FROM (VALUES
      -- (table, constraint, column, on_delete)
      ('club_memberships','club_memberships_user_id_fkey','user_id','CASCADE'),
      ('club_memberships','club_memberships_approved_by_fkey','approved_by','SET NULL'),
      ('user_roles','user_roles_user_id_fkey','user_id','CASCADE'),
      ('session_rsvps','session_rsvps_user_id_fkey','user_id','CASCADE'),
      ('session_attendance','session_attendance_user_id_fkey','user_id','CASCADE'),
      ('session_attendance','session_attendance_marked_by_fkey','marked_by','SET NULL'),
      ('equipment_faults','equipment_faults_reported_by_fkey','reported_by','CASCADE'),
      ('equipment_faults','equipment_faults_resolved_by_fkey','resolved_by','SET NULL'),
      ('sessions','sessions_created_by_fkey','created_by','SET NULL'),
      ('clubs','clubs_created_by_fkey','created_by','SET NULL'),
      ('equipment','equipment_created_by_fkey','created_by','SET NULL'),
      ('session_equipment','session_equipment_checked_by_fkey','checked_by','SET NULL'),
      ('session_teams','session_teams_driver_id_fkey','driver_id','SET NULL'),
      ('session_teams','session_teams_crew_id_fkey','crew_id','SET NULL'),
      ('session_teams','session_teams_patient_id_fkey','patient_id','SET NULL')
    ) AS t(table_name, constraint_name, column_name, on_delete)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class r ON r.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = r.relnamespace
      WHERE n.nspname = 'public'
        AND r.relname = fk.table_name
        AND c.conname = fk.constraint_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.profiles(id) ON DELETE %s',
        fk.table_name, fk.constraint_name, fk.column_name, fk.on_delete
      );
    END IF;
  END LOOP;
END $$;

-- =========================================================
-- 2. Tighten has_role: strict club scoping, no NULL escape
-- =========================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _club_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND club_id = _club_id
  )
$$;

-- =========================================================
-- 3. Tighten is_club_admin: strict club scoping
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_club_admin(_user_id uuid, _club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND club_id = _club_id
      AND role IN ('owner', 'club_admin')
  )
$$;

-- =========================================================
-- 4. user_roles write policies (admin-scoped to their own club)
-- =========================================================
DROP POLICY IF EXISTS "user_roles_insert_admin" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_update_admin" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_delete_admin" ON public.user_roles;

CREATE POLICY "user_roles_insert_admin"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  club_id IS NOT NULL
  AND public.is_club_admin(auth.uid(), club_id)
);

CREATE POLICY "user_roles_update_admin"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  club_id IS NOT NULL
  AND public.is_club_admin(auth.uid(), club_id)
)
WITH CHECK (
  club_id IS NOT NULL
  AND public.is_club_admin(auth.uid(), club_id)
);

-- Owners cannot be removed via this policy (prevents accidentally deleting the last owner)
CREATE POLICY "user_roles_delete_admin"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  club_id IS NOT NULL
  AND public.is_club_admin(auth.uid(), club_id)
  AND role <> 'owner'
);
