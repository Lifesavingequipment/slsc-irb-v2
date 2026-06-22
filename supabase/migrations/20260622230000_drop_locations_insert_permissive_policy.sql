-- locations had two overlapping INSERT policies: locations_insert (any
-- authenticated user) and locations_insert_coach_admin (admins/coaches
-- only). RLS policies are OR'd together, so the permissive locations_insert
-- policy let any club member insert a location, bypassing the intended
-- admin/coach restriction. Drop it so only locations_insert_coach_admin
-- remains. create_club inserts the first location via a SECURITY DEFINER
-- function and is unaffected by RLS.
drop policy if exists "locations_insert" on public.locations;
