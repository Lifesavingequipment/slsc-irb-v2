import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function degreesToCompass(deg: number): string {
  return ['N','NE','E','SE','S','SW','W','NW'][Math.round(deg/45)%8];
}

function weatherCodeInfo(code: number): {emoji:string;label:string} {
  if (code===0) return {emoji:'☀️',label:'Clear'};
  if (code<=3) return {emoji:'⛅',label:'Partly cloudy'};
  if (code===45||code===48) return {emoji:'🌫️',label:'Foggy'};
  if ([51,53,55,61,63,65].includes(code)) return {emoji:'🌧️',label:'Rain'};
  if ([71,73,75,77].includes(code)) return {emoji:'🌨️',label:'Snow'};
  if ([80,81,82].includes(code)) return {emoji:'🌦️',label:'Showers'};
  if ([95,96,99].includes(code)) return {emoji:'⛈️',label:'Thunderstorm'};
  return {emoji:'🌡️',label:'Cloudy'};
}

function getTimezone(lat:number,lng:number):string {
  if (lat>=-44&&lat<=-10&&lng>=113&&lng<=154) return 'Australia/Brisbane';
  if (lat>=-47&&lat<=-34&&lng>=166&&lng<=178) return 'Pacific/Auckland';
  return 'auto';
}

// Returns null when an address can't be resolved — callers must skip and log
// a warning rather than falling back to guessed coordinates.
async function geocode(location:string):Promise<{lat:number;lng:number}|null> {
  const m=location.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
  if (m) return {lat:parseFloat(m[1]),lng:parseFloat(m[2])};
  try {
    const res=await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`,{headers:{'User-Agent':'SLSC-IRB-App/1.0'}});
    const data=await res.json();
    if (data?.[0]) return {lat:parseFloat(data[0].lat),lng:parseFloat(data[0].lon)};
  } catch {/**/}
  return null;
}

async function fetchWeather(lat:number,lng:number,date:string,tz:string) {
  const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,weathercode,windspeed_10m_max,winddirection_10m_dominant,uv_index_max&timezone=${encodeURIComponent(tz)}&start_date=${date}&end_date=${date}`;
  try {
    const res=await fetch(url); const d=await res.json();
    if (!d?.daily) return null;
    const {weathercode,temperature_2m_max,windspeed_10m_max,winddirection_10m_dominant,uv_index_max}=d.daily;
    const {emoji,label}=weatherCodeInfo(weathercode?.[0]??0);
    return {
      emoji,label,
      maxTemp:Math.round(temperature_2m_max?.[0]??0),
      windDir:degreesToCompass(winddirection_10m_dominant?.[0]??0),
      windSpeed:Math.round(windspeed_10m_max?.[0]??0),
      uvIndex: uv_index_max?.[0]!=null ? Math.round(uv_index_max[0]*10)/10 : null,
    };
  } catch { return null; }
}

async function fetchWaves(lat:number,lng:number,date:string,useArchive=false) {
  const base=useArchive?'https://archive-api.open-meteo.com/v1/archive':'https://marine-api.open-meteo.com/v1/marine';
  for (let i=0;i<5;i++) {
    const sl=Math.round((lng+i*0.5)*10000)/10000;
    const slat=i>=2?Math.round((lat-0.1)*10000)/10000:lat;
    const url=`${base}?latitude=${slat}&longitude=${sl}&daily=wave_height_max,wave_period_max,wave_direction_dominant&timezone=auto&start_date=${date}&end_date=${date}`;
    try {
      const res=await fetch(url); const d=await res.json();
      if (d?.daily?.wave_height_max?.[0]!=null) return {heightMax:d.daily.wave_height_max[0],periodMax:d.daily.wave_period_max?.[0]??null,directionDominant:d.daily.wave_direction_dominant?.[0]??null,approx:i>0};
    } catch {/**/}
  }
  return null;
}

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setUTCHours(0,0,0,0);
  const d = new Date(dateStr); d.setUTCHours(0,0,0,0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

// Refreshes weather + surf (NOT tides) for (a) sessions in the next 7 days
// and (b) each club's home/default location, feeding the dashboard "Today"
// panel. Tides are handled separately by daily-tide-refresh since they only
// need to roll over once a day.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    }});
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const now = new Date();
  const todayUtc = now.toISOString().slice(0, 10);
  const rangeStart = `${todayUtc}T00:00:00.000Z`;
  const rangeEnd = new Date(now.getTime() + 7 * 86400000).toISOString();

  // --- Sessions in the next 7 days ---
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, starts_at, location, location_id')
    .gte('starts_at', rangeStart)
    .lte('starts_at', rangeEnd)
    .not('location', 'is', null);

  let sessionsProcessed = 0;
  for (const session of (sessions ?? []) as { id: string; starts_at: string; location: string; location_id: string | null }[]) {
    const { data: existing } = await supabase
      .from('session_weather_cache')
      .select('lat, lng')
      .eq('session_id', session.id)
      .maybeSingle();

    let coords: { lat: number; lng: number } | null =
      existing?.lat != null && existing?.lng != null ? { lat: existing.lat, lng: existing.lng } : null;

    if (!coords && session.location_id) {
      const { data: savedLoc } = await supabase.from('locations').select('lat, lng').eq('id', session.location_id).maybeSingle();
      if (savedLoc?.lat != null && savedLoc?.lng != null) coords = { lat: savedLoc.lat, lng: savedLoc.lng };
    }

    if (!coords) coords = await geocode(session.location);

    if (!coords) {
      console.warn(`[hourly-weather-refresh] No valid coordinates for session ${session.id} (location: "${session.location}") — skipping.`);
      continue;
    }

    const date = session.starts_at.slice(0, 10);
    const tz = getTimezone(coords.lat, coords.lng);
    const useArchive = daysUntil(date) <= 0;

    const [weather, waves] = await Promise.all([
      fetchWeather(coords.lat, coords.lng, date, tz),
      fetchWaves(coords.lat, coords.lng, date, useArchive),
    ]);

    if (weather || waves) {
      await supabase.from('session_weather_cache').upsert({
        session_id: session.id,
        lat: coords.lat,
        lng: coords.lng,
        ...(weather ? { weather, weather_updated_at: new Date().toISOString() } : {}),
        ...(waves ? { waves } : {}),
      }, { onConflict: 'session_id' });
      sessionsProcessed++;
    }
  }

  // --- Each club's home/default location, for the dashboard Today panel ---
  const { data: homeLocations } = await supabase
    .from('locations')
    .select('id, club_id, name, address, lat, lng')
    .eq('is_default', true);

  let locationsProcessed = 0;
  for (const loc of (homeLocations ?? []) as { id: string; club_id: string; name: string; address: string | null; lat: number | null; lng: number | null }[]) {
    const { data: existing } = await supabase
      .from('location_weather_cache')
      .select('lat, lng')
      .eq('location_id', loc.id)
      .maybeSingle();

    let coords: { lat: number; lng: number } | null =
      existing?.lat != null && existing?.lng != null ? { lat: existing.lat, lng: existing.lng }
      : loc.lat != null && loc.lng != null ? { lat: loc.lat, lng: loc.lng }
      : null;

    if (!coords) coords = await geocode(loc.address || loc.name);

    if (!coords) {
      console.warn(`[hourly-weather-refresh] No valid coordinates for location ${loc.id} ("${loc.name}") — skipping.`);
      continue;
    }

    const tz = getTimezone(coords.lat, coords.lng);

    const [weather, waves] = await Promise.all([
      fetchWeather(coords.lat, coords.lng, todayUtc, tz),
      fetchWaves(coords.lat, coords.lng, todayUtc, false),
    ]);

    if (weather || waves) {
      await supabase.from('location_weather_cache').upsert({
        location_id: loc.id,
        club_id: loc.club_id,
        lat: coords.lat,
        lng: coords.lng,
        ...(weather ? { weather, weather_updated_at: new Date().toISOString() } : {}),
        ...(waves ? { waves } : {}),
      }, { onConflict: 'location_id' });
      locationsProcessed++;
    }
  }

  return new Response(JSON.stringify({ sessionsProcessed, locationsProcessed }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});
