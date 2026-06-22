-- create_club now accepts confirmed venue coordinates so the primary venue
-- saved during club creation has verified lat/lng instead of relying on a
-- later geocode of its address. The new params extend the signature, so
-- Postgres treats it as a distinct overload — drop the old one first to
-- avoid an ambiguous-call error when callers omit the new optional args.
drop function if exists public.create_club(text, text, text, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.create_club(p_name text, p_first_name text, p_last_name text, p_email text, p_address text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_logo_url text DEFAULT NULL::text, p_venue_name text DEFAULT NULL::text, p_venue_address text DEFAULT NULL::text, p_venue_lat double precision DEFAULT NULL::double precision, p_venue_lng double precision DEFAULT NULL::double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid      uuid := auth.uid();
  v_club_id  uuid;
  v_branding jsonb := '{}'::jsonb;
  v_code     text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if coalesce(btrim(p_name),'') = '' then raise exception 'Club name is required'; end if;

  if p_description is not null then v_branding := v_branding || jsonb_build_object('description', p_description); end if;
  if p_logo_url   is not null then v_branding := v_branding || jsonb_build_object('logo_url',   p_logo_url);   end if;

  insert into public.clubs (club_name, address, branding)
  values (p_name, p_address, case when v_branding <> '{}'::jsonb then v_branding else null end)
  returning id into v_club_id;

  if not exists (select 1 from public.members where auth_user_id = v_uid and club_id = v_club_id) then
    insert into public.members (club_id, auth_user_id, first_name, last_name, email)
    values (v_club_id, v_uid,
            coalesce(nullif(btrim(p_first_name),''),'Unknown'),
            coalesce(nullif(btrim(p_last_name),''),'Unknown'),
            coalesce(p_email,''));
  end if;

  insert into public.club_memberships
    (user_id, club_id, status, role, is_primary_club, approved_at, approved_by, joined_at)
  values (v_uid, v_club_id, 'approved', 'owner', true, now(), v_uid, now());

  insert into public.club_roles (user_id, club_id, role, is_primary_admin)
  values (v_uid, v_club_id, 'owner', true)
  on conflict (user_id, club_id) do update set role = 'owner', is_primary_admin = true;

  if p_venue_name is not null and btrim(p_venue_name) <> '' then
    insert into public.locations (club_id, name, address, lat, lng, created_by)
    values (v_club_id, p_venue_name, p_venue_address, p_venue_lat, p_venue_lng, v_uid);
  end if;

  v_code := upper(substr(md5(random()::text || v_club_id::text || clock_timestamp()::text), 1, 8));
  insert into public.club_invite_codes (club_id, code, created_by, active)
  values (v_club_id, v_code, v_uid, true);

  return jsonb_build_object('club_id', v_club_id, 'club_name', p_name, 'invite_code', v_code);
end;
$function$
