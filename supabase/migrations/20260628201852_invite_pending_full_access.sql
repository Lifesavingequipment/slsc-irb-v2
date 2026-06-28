-- Invite-code joiners land as 'pending' but get full app access.
--
-- 1. is_approved_member: treat 'pending' the same as 'approved' for RLS access gates.
--    (Members page pending-tab filter and admin pending-count are driven by frontend checks
--    against club_memberships.status = 'pending', which are unchanged.)
-- 2. members_select: update the cross-member visibility policy to match.
-- 3. redeem_club_invite_code: set status = 'pending' and membership_status = 'pending'
--    instead of 'approved'/'active', while still granting the member role in club_roles.

-- 1. Broaden is_approved_member to include pending
CREATE OR REPLACE FUNCTION public.is_approved_member(_user_id UUID, _club_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_memberships
    WHERE user_id = _user_id AND club_id = _club_id AND status IN ('approved', 'pending')
  )
$$;

-- 2. Broaden members_select RLS to include pending club memberships
DROP POLICY IF EXISTS "members_select" ON public.members;
CREATE POLICY "members_select" ON public.members FOR SELECT TO authenticated
USING (
  (club_id IN (
    SELECT cm.club_id FROM public.club_memberships cm
    WHERE cm.user_id = auth.uid() AND cm.status IN ('approved', 'pending')
  ))
  OR (auth_user_id = auth.uid())
  OR is_platform_owner(auth.uid())
);

-- 3. Update redeem_club_invite_code to join as pending (not approved)
CREATE OR REPLACE FUNCTION public.redeem_club_invite_code(_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id uuid;
  v_user uuid := auth.uid();
  v_existing_status membership_status;
  v_profile profiles%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT club_id INTO v_club_id
    FROM public.club_invite_codes
   WHERE code = _code AND active = true
   LIMIT 1;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive invite code';
  END IF;

  SELECT status INTO v_existing_status
    FROM public.club_memberships
   WHERE user_id = v_user AND club_id = v_club_id
   LIMIT 1;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user;

  IF v_existing_status IS NULL THEN
    -- Fresh join via invite code: pending status with immediate role access
    INSERT INTO public.club_memberships (user_id, club_id, status, joined_at)
    VALUES (v_user, v_club_id, 'pending', now());

    -- Grant member role now (handle_membership_approved trigger only fires on UPDATE)
    INSERT INTO public.club_roles (user_id, club_id, role)
    VALUES (v_user, v_club_id, 'member')
    ON CONFLICT (user_id, club_id) DO NOTHING;

    INSERT INTO public.members (
      club_id, auth_user_id, first_name, last_name, email, phone, gender,
      membership_status, membership_type, driver_flag, crew_flag, patient_flag,
      notification_prefs, join_date
    )
    VALUES (
      v_club_id,
      v_user,
      COALESCE(v_profile.first_name, split_part(COALESCE(v_profile.full_name, ''), ' ', 1), 'Unknown'),
      COALESCE(v_profile.last_name, CASE WHEN strpos(COALESCE(v_profile.full_name, ''), ' ') > 0
        THEN substr(v_profile.full_name, strpos(v_profile.full_name, ' ') + 1)
        ELSE 'Unknown' END, 'Unknown'),
      COALESCE(v_profile.email, ''),
      v_profile.phone,
      v_profile.gender,
      'pending',
      'senior',
      false, false, false,
      '{}',
      now()
    )
    ON CONFLICT DO NOTHING;

  ELSIF v_existing_status = 'approved' THEN
    -- Already a full member — nothing to do
    NULL;

  ELSE
    -- Was rejected or already pending: reset to pending and ensure role exists
    UPDATE public.club_memberships
       SET status = 'pending', joined_at = COALESCE(joined_at, now())
     WHERE user_id = v_user AND club_id = v_club_id;

    -- handle_membership_approved only fires when transitioning TO 'approved'; grant role manually
    INSERT INTO public.club_roles (user_id, club_id, role)
    VALUES (v_user, v_club_id, 'member')
    ON CONFLICT (user_id, club_id) DO NOTHING;

    INSERT INTO public.members (
      club_id, auth_user_id, first_name, last_name, email, phone, gender,
      membership_status, membership_type, driver_flag, crew_flag, patient_flag,
      notification_prefs, join_date
    )
    VALUES (
      v_club_id,
      v_user,
      COALESCE(v_profile.first_name, split_part(COALESCE(v_profile.full_name, ''), ' ', 1), 'Unknown'),
      COALESCE(v_profile.last_name, CASE WHEN strpos(COALESCE(v_profile.full_name, ''), ' ') > 0
        THEN substr(v_profile.full_name, strpos(v_profile.full_name, ' ') + 1)
        ELSE 'Unknown' END, 'Unknown'),
      COALESCE(v_profile.email, ''),
      v_profile.phone,
      v_profile.gender,
      'pending',
      'senior',
      false, false, false,
      '{}',
      now()
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_club_id;
END;
$$;
