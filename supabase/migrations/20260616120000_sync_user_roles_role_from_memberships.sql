-- Sync club_roles (exposed via the user_roles view) with the actual membership role.
-- user_roles is a VIEW over public.club_roles, so we target the base table directly
-- (ON CONFLICT cannot infer a constraint through an auto-updatable view).

-- 1. Remove stray 'member' rows the old trigger added on top of a user's real role
DELETE FROM public.club_roles cr
WHERE cr.role = 'member'
  AND EXISTS (
    SELECT 1 FROM public.club_roles o
    WHERE o.user_id = cr.user_id
      AND o.club_id = cr.club_id
      AND o.role <> 'member'
  );

-- 2. Enforce one role per (user, club) so ON CONFLICT (user_id, club_id) can target it
ALTER TABLE public.club_roles
  ADD CONSTRAINT club_roles_user_club_unique UNIQUE (user_id, club_id);

-- 3. On approval, sync the ACTUAL membership role (was previously hard-coded to 'member')
CREATE OR REPLACE FUNCTION public.handle_membership_approved()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    INSERT INTO public.club_roles (user_id, club_id, role)
    VALUES (NEW.user_id, NEW.club_id, NEW.role)
    ON CONFLICT (user_id, club_id) DO UPDATE SET role = NEW.role;
    NEW.approved_at = COALESCE(NEW.approved_at, now());
  END IF;
  RETURN NEW;
END;
$function$;

-- 4. Keep club_roles in sync if a membership's role changes after approval
CREATE OR REPLACE FUNCTION public.handle_membership_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NEW.status = 'approved' THEN
    INSERT INTO public.club_roles (user_id, club_id, role)
    VALUES (NEW.user_id, NEW.club_id, NEW.role)
    ON CONFLICT (user_id, club_id) DO UPDATE SET role = NEW.role;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_membership_role_change ON public.club_memberships;
CREATE TRIGGER on_membership_role_change
BEFORE UPDATE ON public.club_memberships
FOR EACH ROW EXECUTE FUNCTION public.handle_membership_role_change();
