-- Morning Brief RPC for the Coach dashboard.
-- Returns everything the "Morning Brief" card needs in a single round-trip:
-- next session, RSVP counts, transport demand, attendance state, and cached
-- weather/tide for that session. Callable only by coaches/admins/owners of the
-- club (SECURITY DEFINER + explicit role guard).

create or replace function public.get_coach_morning_brief(p_club_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_next record;
  v_going int := 0;
  v_maybe int := 0;
  v_unavailable int := 0;
  v_responded int := 0;
  v_active int := 0;
  v_no_response int := 0;
  v_transport int := 0;
  v_att_started boolean := false;
  v_weather jsonb;
  v_tides jsonb;
  v_weather_summary text;
  v_next_high text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not (
    public.has_role(v_uid, p_club_id, 'coach'::app_role)
    or public.has_role(v_uid, p_club_id, 'club_admin'::app_role)
    or public.has_role(v_uid, p_club_id, 'owner'::app_role)
  ) then
    raise exception 'not authorized';
  end if;

  -- Next upcoming session for the club (mirrors the dashboard's session filter:
  -- still running, or starting in the future when there is no end time).
  select s.id, s.title, s.starts_at, s.location
    into v_next
  from sessions s
  where s.club_id = p_club_id
    and (s.ends_at >= now() or (s.ends_at is null and s.starts_at >= now()))
  order by s.starts_at asc
  limit 1;

  if v_next.id is null then
    return jsonb_build_object(
      'next_session', null,
      'rsvp_counts', jsonb_build_object('going', 0, 'maybe', 0, 'no_response', 0, 'unavailable', 0),
      'members_needing_transport', 0,
      'attendance_started', false,
      'weather', null,
      'tide', null
    );
  end if;

  -- RSVP breakdown for the next session.
  select
    count(*) filter (where status = 'going'),
    count(*) filter (where status = 'maybe'),
    count(*) filter (where status = 'not_going')
    into v_going, v_maybe, v_unavailable
  from session_rsvps
  where session_id = v_next.id;

  v_responded := v_going + v_maybe + v_unavailable;

  -- Active members in the club. Effective status mirrors the Members page:
  -- club_memberships.status (matched by auth_user_id) ?? members.membership_status
  -- ?? 'approved'.
  select count(*)
    into v_active
  from members m
  left join club_memberships cm
    on cm.user_id = m.auth_user_id and cm.club_id = m.club_id
  where m.club_id = p_club_id
    and coalesce(cm.status::text, m.membership_status, 'approved') in ('approved', 'active');

  v_no_response := greatest(v_active - v_responded, 0);

  -- Outstanding transport demand.
  select count(*)
    into v_transport
  from carpool_requests
  where session_id = v_next.id and status = 'pending';

  -- Has attendance been started for this session?
  select exists(select 1 from session_attendance where session_id = v_next.id)
    into v_att_started;

  -- Cached weather / tides (nullable).
  select weather, tides into v_weather, v_tides
  from session_weather_cache
  where session_id = v_next.id;

  if v_weather is not null then
    v_weather_summary := nullif(
      trim(both ' ' from concat_ws(' ',
        nullif(v_weather->>'emoji', ''),
        nullif(v_weather->>'label', ''),
        case when v_weather->>'maxTemp' is not null then (v_weather->>'maxTemp') || '°C' end
      )),
      ''
    );
  end if;

  if v_tides is not null then
    select t->>'time'
      into v_next_high
    from jsonb_array_elements(v_tides) t
    where t->>'type' = 'High'
    limit 1;
  end if;

  return jsonb_build_object(
    'next_session', jsonb_build_object(
      'id', v_next.id,
      'name', v_next.title,
      'starts_at', v_next.starts_at,
      'location', v_next.location
    ),
    'rsvp_counts', jsonb_build_object(
      'going', v_going,
      'maybe', v_maybe,
      'no_response', v_no_response,
      'unavailable', v_unavailable
    ),
    'members_needing_transport', v_transport,
    'attendance_started', v_att_started,
    'weather', case
      when v_weather_summary is null then null
      else jsonb_build_object('summary', v_weather_summary)
    end,
    'tide', case
      when v_next_high is null then null
      else jsonb_build_object('next_high_time', v_next_high)
    end
  );
end;
$$;

grant execute on function public.get_coach_morning_brief(uuid) to authenticated;
