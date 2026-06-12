
-- 1) Create the new restricted table
CREATE TABLE public.profile_identity (
  user_id uuid PRIMARY KEY,
  date_of_birth date,
  passport_number text,
  passport_expiry date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_identity TO authenticated;
GRANT ALL ON public.profile_identity TO service_role;

ALTER TABLE public.profile_identity ENABLE ROW LEVEL SECURITY;

-- Self or coach/admin of a shared (approved) club
CREATE POLICY pi_select ON public.profile_identity FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.club_memberships cm
    WHERE cm.user_id = profile_identity.user_id
      AND cm.status = 'approved'
      AND (public.is_club_admin(auth.uid(), cm.club_id)
           OR public.has_role(auth.uid(), cm.club_id, 'coach'::app_role))
  )
);

CREATE POLICY pi_insert ON public.profile_identity FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.club_memberships cm
    WHERE cm.user_id = profile_identity.user_id
      AND cm.status = 'approved'
      AND (public.is_club_admin(auth.uid(), cm.club_id)
           OR public.has_role(auth.uid(), cm.club_id, 'coach'::app_role))
  )
);

CREATE POLICY pi_update ON public.profile_identity FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.club_memberships cm
    WHERE cm.user_id = profile_identity.user_id
      AND cm.status = 'approved'
      AND (public.is_club_admin(auth.uid(), cm.club_id)
           OR public.has_role(auth.uid(), cm.club_id, 'coach'::app_role))
  )
)
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.club_memberships cm
    WHERE cm.user_id = profile_identity.user_id
      AND cm.status = 'approved'
      AND (public.is_club_admin(auth.uid(), cm.club_id)
           OR public.has_role(auth.uid(), cm.club_id, 'coach'::app_role))
  )
);

CREATE POLICY pi_delete ON public.profile_identity FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.is_platform_owner(auth.uid()));

CREATE TRIGGER profile_identity_touch
BEFORE UPDATE ON public.profile_identity
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) Migrate existing data
INSERT INTO public.profile_identity (user_id, date_of_birth, passport_number, passport_expiry)
SELECT id, date_of_birth, passport_number, passport_expiry
FROM public.profiles
WHERE date_of_birth IS NOT NULL
   OR passport_number IS NOT NULL
   OR passport_expiry IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- 3) Drop sensitive columns from profiles
ALTER TABLE public.profiles
  DROP COLUMN date_of_birth,
  DROP COLUMN passport_number,
  DROP COLUMN passport_expiry;
