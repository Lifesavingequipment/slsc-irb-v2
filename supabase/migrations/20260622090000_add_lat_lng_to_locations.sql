-- Confirmed coordinates for saved locations. Null means no verified
-- coordinates yet — weather/tide jobs must skip these locations and log a
-- warning rather than guessing (see fetch-session-weather, hourly-weather-refresh,
-- daily-tide-refresh).
alter table public.locations
  add column lat double precision,
  add column lng double precision;

comment on column public.locations.lat is 'Confirmed latitude — set via geocode confirmation or manual entry. Null means no verified coordinates; weather/tide jobs must skip these locations rather than guessing.';
comment on column public.locations.lng is 'Confirmed longitude — see lat comment.';
