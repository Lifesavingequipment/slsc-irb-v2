CREATE TABLE public.club_invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  code text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_invite_codes TO authenticated;
GRANT ALL ON public.club_invite_codes TO service_role;

ALTER TABLE public.club_invite_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invite_codes_select_members" ON public.club_invite_codes
  FOR SELECT TO authenticated
  USING (public.is_approved_member(auth.uid(), club_id) OR public.is_club_admin(auth.uid(), club_id));

CREATE POLICY "invite_codes_insert_admin" ON public.club_invite_codes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_club_admin(auth.uid(), club_id) AND created_by = auth.uid());

CREATE POLICY "invite_codes_update_admin" ON public.club_invite_codes
  FOR UPDATE TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id))
  WITH CHECK (public.is_club_admin(auth.uid(), club_id));

CREATE POLICY "invite_codes_delete_admin" ON public.club_invite_codes
  FOR DELETE TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id));

CREATE TRIGGER tg_invite_codes_touch
  BEFORE UPDATE ON public.club_invite_codes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_invite_codes_club ON public.club_invite_codes(club_id);

-- Redeem function: signed-in user submits a code, becomes approved member of the club.
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

  IF v_existing_status IS NULL THEN
    INSERT INTO public.club_memberships (user_id, club_id, status, approved_at, approved_by)
    VALUES (v_user, v_club_id, 'approved', now(), v_user);
  ELSIF v_existing_status <> 'approved' THEN
    UPDATE public.club_memberships
       SET status = 'approved', approved_at = now(), approved_by = v_user
     WHERE user_id = v_user AND club_id = v_club_id;
    -- handle_membership_approved trigger only fires on UPDATE status change; ensure member role exists
    INSERT INTO public.user_roles (user_id, club_id, role)
      VALUES (v_user, v_club_id, 'member')
      ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_club_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.redeem_club_invite_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_club_invite_code(text) TO authenticated;