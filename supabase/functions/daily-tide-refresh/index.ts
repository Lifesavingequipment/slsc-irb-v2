import { createClient } from 'jsr:@supabase/supabase-js@2';

const WORLDTIDES_KEY = Deno.env.get('VITE_WORLDTIDES_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function formatTideTime(iso: string): string {
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (!m) return '';
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

async function geocode(location: string): Promise<{ lat: number; lng: number }> {
  const m = location.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'SLSC-IRB-App/1.0' } }
    );
    const data = await res.json();
    if (data?.[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch { /**/ }
  return { lat: -28.0167, lng: 153.4 };
}

async function fetchTides(lat: number, lng: number, date: string) {
  if (!WORLDTIDES_KEY) return null;
  const url = `https://www.worldtides.info/api/v3?extremes&lat=${lat}&lon=${lng}&key=${WORLDTIDES_KEY}&days=2&date=${date}`;
  const res = await fetch(url);
  const d = await res.json();
  if (!Array.isArray(d?.extremes)) return null;
  return d.extremes
    .filter((e: { date?: string }) => typeof e.date === 'string' && e.date.startsWith(date))
    .slice(0, 4)
    .map((e: { date: string; type: string; height: number }) => ({
      time: formatTideTime(e.date),
      type: e.type === 'Low' ? 'Low' : 'High',
      height: e.height,
    }));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    }});
  }

  // verify_jwt=true handles JWT validation; this function is called by the cron
  // using the anon key which is a valid JWT Supabase will accept.
  // The service role key is only used internally for DB writes.
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const todayDate = new Date().toISOString().slice(0, 10);

  const results: { id: string; status: string }[] = [];
  let sessionsProcessed = 0;
  let locationsProcessed = 0;

  // --- Backstop: sessions today still missing tides ---
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, starts_at, location')
    .gte('starts_at', `${todayDate}T00:00:00.000Z`)
    .lte('starts_at', `${todayDate}T23:59:59.999Z`)
    .not('location', 'is', null);

  if (sessions && sessions.length > 0) {
    const sessionIds = sessions.map((s: { id: string }) => s.id);
    const { data: existing } = await supabase
      .from('session_weather_cache')
      .select('session_id, tides, lat, lng')
      .in('session_id', sessionIds);

    const existingMap = new Map((existing ?? []).map((e: { session_id: string; tides: unknown; lat: number; lng: number }) => [e.session_id, e]));

    for (const session of sessions as { id: string; starts_at: string; location: string }[]) {
      const cached = existingMap.get(session.id);
      if (cached?.tides) {
        results.push({ id: session.id, status: 'session: skipped (tides already cached)' });
        continue;
      }

      const coords = cached?.lat && cached?.lng
        ? { lat: cached.lat, lng: cached.lng }
        : await geocode(session.location);

      const tides = await fetchTides(coords.lat, coords.lng, todayDate);

      if (tides && tides.length > 0) {
        await supabase.from('session_weather_cache').upsert({
          session_id: session.id,
          lat: coords.lat,
          lng: coords.lng,
          tides,
          tides_updated_at: new Date().toISOString(),
        }, { onConflict: 'session_id' });
        sessionsProcessed++;
        results.push({ id: session.id, status: 'session: tides fetched' });
      } else {
        results.push({ id: session.id, status: 'session: tide fetch failed or no data' });
      }

      await new Promise(r => setTimeout(r, 1100));
    }
  }

  // --- Each club's home/default location, for the dashboard Today panel ---
  // Tides only need to roll over once a day, so this only fetches when the
  // cached tides aren't already for today.
  const { data: homeLocations } = await supabase
    .from('locations')
    .select('id, club_id, name, address')
    .eq('is_default', true);

  for (const loc of (homeLocations ?? []) as { id: string; club_id: string; name: string; address: string | null }[]) {
    const { data: existingLoc } = await supabase
      .from('location_weather_cache')
      .select('lat, lng, tides_date')
      .eq('location_id', loc.id)
      .maybeSingle();

    if (existingLoc?.tides_date === todayDate) {
      results.push({ id: loc.id, status: 'location: skipped (tides already cached for today)' });
      continue;
    }

    const coords = existingLoc?.lat != null && existingLoc?.lng != null
      ? { lat: existingLoc.lat, lng: existingLoc.lng }
      : await geocode(loc.address || loc.name);

    const tides = await fetchTides(coords.lat, coords.lng, todayDate);

    if (tides && tides.length > 0) {
      await supabase.from('location_weather_cache').upsert({
        location_id: loc.id,
        club_id: loc.club_id,
        lat: coords.lat,
        lng: coords.lng,
        tides,
        tides_date: todayDate,
        tides_updated_at: new Date().toISOString(),
      }, { onConflict: 'location_id' });
      locationsProcessed++;
      results.push({ id: loc.id, status: 'location: tides fetched' });
    } else {
      results.push({ id: loc.id, status: 'location: tide fetch failed or no data' });
    }

    await new Promise(r => setTimeout(r, 1100));
  }

  return new Response(JSON.stringify({ sessionsProcessed, locationsProcessed, results }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});
