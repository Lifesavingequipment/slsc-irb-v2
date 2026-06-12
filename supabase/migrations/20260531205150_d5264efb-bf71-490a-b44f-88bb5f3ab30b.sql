
-- Carpools tables
CREATE TYPE public.carpool_status AS ENUM ('open', 'full', 'cancelled');
CREATE TYPE public.carpool_request_status AS ENUM ('pending', 'assigned', 'cancelled');

CREATE TABLE public.carpools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  club_id uuid NOT NULL,
  driver_user_id uuid NOT NULL,
  vehicle_name text NOT NULL,
  departure_location text NOT NULL,
  departure_time timestamptz NOT NULL,
  available_seats integer NOT NULL CHECK (available_seats >= 0 AND available_seats <= 50),
  notes text,
  status public.carpool_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.carpool_passengers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carpool_id uuid NOT NULL REFERENCES public.carpools(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  user_id uuid NOT NULL,
  pickup_location text,
  notes text,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);

CREATE TABLE public.carpool_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  club_id uuid NOT NULL,
  user_id uuid NOT NULL,
  pickup_location text NOT NULL,
  preferred_time timestamptz,
  notes text,
  status public.carpool_request_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.carpools TO authenticated;
GRANT ALL ON public.carpools TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carpool_passengers TO authenticated;
GRANT ALL ON public.carpool_passengers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carpool_requests TO authenticated;
GRANT ALL ON public.carpool_requests TO service_role;

ALTER TABLE public.carpools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carpool_passengers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carpool_requests ENABLE ROW LEVEL SECURITY;

-- carpools policies
CREATE POLICY carpools_select_members ON public.carpools FOR SELECT TO authenticated
  USING (is_approved_member(auth.uid(), club_id) OR is_club_admin(auth.uid(), club_id));

CREATE POLICY carpools_insert_self ON public.carpools FOR INSERT TO authenticated
  WITH CHECK (
    driver_user_id = auth.uid()
    AND is_approved_member(auth.uid(), club_id)
  );

CREATE POLICY carpools_update_driver_or_coach ON public.carpools FOR UPDATE TO authenticated
  USING (
    driver_user_id = auth.uid()
    OR is_club_admin(auth.uid(), club_id)
    OR has_role(auth.uid(), club_id, 'coach'::app_role)
  );

CREATE POLICY carpools_delete_driver_or_coach ON public.carpools FOR DELETE TO authenticated
  USING (
    driver_user_id = auth.uid()
    OR is_club_admin(auth.uid(), club_id)
    OR has_role(auth.uid(), club_id, 'coach'::app_role)
  );

-- carpool_passengers policies
CREATE POLICY cp_select ON public.carpool_passengers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.carpools c
    WHERE c.id = carpool_passengers.carpool_id
      AND (is_approved_member(auth.uid(), c.club_id) OR is_club_admin(auth.uid(), c.club_id))
  ));

CREATE POLICY cp_insert ON public.carpool_passengers FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.carpools c
      WHERE c.id = carpool_passengers.carpool_id
        AND c.driver_user_id <> carpool_passengers.user_id
        AND (
          (carpool_passengers.user_id = auth.uid() AND is_approved_member(auth.uid(), c.club_id))
          OR is_club_admin(auth.uid(), c.club_id)
          OR has_role(auth.uid(), c.club_id, 'coach'::app_role)
        )
    )
  );

CREATE POLICY cp_update_coach ON public.carpool_passengers FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.carpools c
    WHERE c.id = carpool_passengers.carpool_id
      AND (is_club_admin(auth.uid(), c.club_id) OR has_role(auth.uid(), c.club_id, 'coach'::app_role))
  ));

CREATE POLICY cp_delete ON public.carpool_passengers FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.carpools c
      WHERE c.id = carpool_passengers.carpool_id
        AND (c.driver_user_id = auth.uid()
             OR is_club_admin(auth.uid(), c.club_id)
             OR has_role(auth.uid(), c.club_id, 'coach'::app_role))
    )
  );

-- carpool_requests policies
CREATE POLICY cr_select ON public.carpool_requests FOR SELECT TO authenticated
  USING (is_approved_member(auth.uid(), club_id) OR is_club_admin(auth.uid(), club_id));

CREATE POLICY cr_insert ON public.carpool_requests FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND is_approved_member(auth.uid(), club_id)
  );

CREATE POLICY cr_update ON public.carpool_requests FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR is_club_admin(auth.uid(), club_id)
    OR has_role(auth.uid(), club_id, 'coach'::app_role)
  );

CREATE POLICY cr_delete ON public.carpool_requests FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR is_club_admin(auth.uid(), club_id)
    OR has_role(auth.uid(), club_id, 'coach'::app_role)
  );

-- Triggers for capacity rules + updated_at
CREATE TRIGGER trg_carpools_touch BEFORE UPDATE ON public.carpools
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_carpool_requests_touch BEFORE UPDATE ON public.carpool_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_carpool_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seats integer;
  v_count integer;
  v_session uuid;
  v_driver uuid;
BEGIN
  SELECT available_seats, session_id, driver_user_id INTO v_seats, v_session, v_driver
    FROM public.carpools WHERE id = NEW.carpool_id;
  IF NEW.user_id = v_driver THEN
    RAISE EXCEPTION 'Driver cannot be a passenger in their own vehicle';
  END IF;
  IF NEW.session_id IS DISTINCT FROM v_session THEN
    NEW.session_id := v_session;
  END IF;
  SELECT count(*) INTO v_count FROM public.carpool_passengers WHERE carpool_id = NEW.carpool_id
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  IF v_count + 1 > v_seats THEN
    RAISE EXCEPTION 'Vehicle is full';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_cp_capacity BEFORE INSERT OR UPDATE ON public.carpool_passengers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_carpool_capacity();
