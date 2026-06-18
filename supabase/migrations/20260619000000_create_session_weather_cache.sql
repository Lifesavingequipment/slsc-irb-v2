-- Session weather/tide cache
-- Tides are fetched once per session date and kept permanently.
-- Weather/waves are refreshed on a staleness schedule driven by the app.

create table public.session_weather_cache (
  session_id         uuid primary key references public.sessions(id) on delete cascade,
  lat                double precision,
  lng                double precision,
  weather            jsonb default null,
  waves              jsonb default null,
  weather_updated_at timestamptz default null,
  tides              jsonb default null,
  tides_updated_at   timestamptz default null,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

alter table public.session_weather_cache enable row level security;

create policy "weather_cache_select" on public.session_weather_cache
  for select to authenticated using (
    exists (
      select 1 from public.sessions s
      where s.id = session_id
        and s.club_id in (
          select club_id from public.members where auth_user_id = auth.uid()
        )
    )
  );

create or replace function public.touch_weather_cache_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger weather_cache_updated_at
  before update on public.session_weather_cache
  for each row execute function public.touch_weather_cache_updated_at();
