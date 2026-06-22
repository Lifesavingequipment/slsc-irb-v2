import { createClient } from 'jsr:@supabase/supabase-js@2';

const WORLDTIDES_KEY = Deno.env.get('VITE_WORLDTIDES_API_KEY') ?? '';
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

function formatTideTime(iso:string):string {
  const m=iso.match(/T(\d{2}):(\d{2})/);
  if (!m) return '';
  let h=parseInt(m[1],10); const min=m[2];
  const ampm=h>=12?'PM':'AM'; h=h%12||12;
  return `${h}:${min} ${ampm}`;
}

async function fetchTides(lat:number,lng:number,date:string) {
  if (!WORLDTIDES_KEY) return null;
  const url=`https://www.worldtides.info/api/v3?extremes&lat=${lat}&lon=${lng}&key=${WORLDTIDES_KEY}&days=2&date=${date}`;
  try {
    const res=await fetch(url); const d=await res.json();
    if (!Array.isArray(d?.extremes)) return null;
    return d.extremes
      .filter((e:{date?:string})=>typeof e.date==='string'&&e.date.startsWith(date))
      .slice(0,4)
      .map((e:{date:string;type:string;height:number})=>({time:formatTideTime(e.date),type:e.type==='Low'?'Low':'High',height:e.height}));
  } catch { return null; }
}

// On-demand fetch for a single saved location, used when a location is set
// as a club's home/default beach so the dashboard "Today" panel doesn't sit
// blank until the next hourly-weather-refresh / daily-tide-refresh cron run.
// Mirrors fetch-session-weather's prefetch pattern but writes to
// location_weather_cache and always fetches weather + waves + tides.
Deno.serve(async (req:Request)=>{
  if (req.method==='OPTIONS') return new Response('ok',{headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}});

  const supabase=createClient(SUPABASE_URL,SUPABASE_SERVICE_KEY);

  let body:{location_id:string};
  try { body=await req.json(); } catch { return new Response(JSON.stringify({error:'Invalid JSON'}),{status:400}); }

  const {location_id}=body;
  if (!location_id) return new Response(JSON.stringify({error:'location_id required'}),{status:400});

  const {data:loc,error:locErr}=await supabase.from('locations').select('id,club_id,name,address,lat,lng').eq('id',location_id).maybeSingle();
  if (locErr||!loc) return new Response(JSON.stringify({error:'Location not found'}),{status:404});

  let coords:{lat:number;lng:number}|null=loc.lat!=null&&loc.lng!=null?{lat:loc.lat,lng:loc.lng}:null;
  if (!coords) coords=await geocode(loc.address||loc.name);
  if (!coords) {
    console.warn(`[fetch-location-weather] No valid coordinates for location ${location_id} ("${loc.name}") — skipping.`);
    return new Response(JSON.stringify({location_id,error:'No valid coordinates for this location',skipped:true}),{headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
  }

  const todayUtc=new Date().toISOString().slice(0,10);
  const tz=getTimezone(coords.lat,coords.lng);

  const [weather,waves,tides]=await Promise.all([
    fetchWeather(coords.lat,coords.lng,todayUtc,tz),
    fetchWaves(coords.lat,coords.lng,todayUtc,false),
    fetchTides(coords.lat,coords.lng,todayUtc),
  ]);

  const now=new Date().toISOString();
  await supabase.from('location_weather_cache').upsert({
    location_id,
    club_id:loc.club_id,
    lat:coords.lat,
    lng:coords.lng,
    ...(weather?{weather,weather_updated_at:now}:{}),
    ...(waves?{waves}:{}),
    ...(tides&&tides.length>0?{tides,tides_date:todayUtc,tides_updated_at:now}:{}),
  },{onConflict:'location_id'});

  return new Response(JSON.stringify({location_id,weather,waves,tides}),{headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
});
