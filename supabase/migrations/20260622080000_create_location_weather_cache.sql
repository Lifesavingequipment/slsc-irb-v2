-- Per-club home location weather/surf/tide cache, used by the dashboard
-- "Today" panel. Weather/waves are refreshed hourly (hourly-weather-refresh
-- function); tides are refreshed once a day for "today" (daily-tide-refresh
-- function), since they only need to roll over at midnight.

create table public.location_weather_cache (
  location_id        uuid primary key references public.locations(id) on delete cascade,
  club_id             uuid not null references public.clubs(id) on delete cascade,
  lat                 double precision,
  lng                 double precision,
  weather             jsonb default null,
  waves               jsonb default null,
  weather_updated_at  timestamptz default null,
  tides               jsonb default null,
  tides_date          date default null,
  tides_updated_at    timestamptz default null,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

alter table public.location_weather_cache enable row level security;

create policy "location_weather_cache_select" on public.location_weather_cache
  for select to authenticated using (
    club_id in (
      select club_id from public.members where auth_user_id = auth.uid()
    )
  );

create trigger location_weather_cache_updated_at
  before update on public.location_weather_cache
  for each row execute function public.touch_weather_cache_updated_at();
