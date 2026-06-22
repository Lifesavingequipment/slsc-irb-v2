import { createClient } from 'jsr:@supabase/supabase-js@2';

const WORLDTIDES_KEY = Deno.env.get('VITE_WORLDTIDES_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const WEATHER_INTERVALS = { within2h: 30, today: 60, tomorrow: 180, future: 360 };

function minutesSince(ts: string | null): number {
  if (!ts) return Infinity;
  return (Date.now() - new Date(ts).getTime()) / 60000;
}

function hoursSince(ts: string | null): number {
  if (!ts) return Infinity;
  return (Date.now() - new Date(ts).getTime()) / 3600000;
}

function daysUntil(startsAt: string): number {
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(startsAt); d.setHours(0,0,0,0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function hoursUntil(startsAt: string): number {
  return (new Date(startsAt).getTime() - Date.now()) / 3600000;
}

function weatherIntervalMinutes(startsAt: string): number {
  const h = hoursUntil(startsAt);
  if (h <= 2) return WEATHER_INTERVALS.within2h;
  if (h <= 24) return WEATHER_INTERVALS.today;
  if (h <= 48) return WEATHER_INTERVALS.tomorrow;
  return WEATHER_INTERVALS.future;
}

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

async function geocode(location:string):Promise<{lat:number;lng:number}> {
  const m=location.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
  if (m) return {lat:parseFloat(m[1]),lng:parseFloat(m[2])};
  try {
    const res=await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`,{headers:{'User-Agent':'SLSC-IRB-App/1.0'}});
    const data=await res.json();
    if (data?.[0]) return {lat:parseFloat(data[0].lat),lng:parseFloat(data[0].lon)};
  } catch {/**/}
  return {lat:-28.0167,lng:153.4};
}

async function fetchWeather(lat:number,lng:number,date:string,tz:string) {
  const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,weathercode,windspeed_10m_max,winddirection_10m_dominant,uv_index_max&timezone=${encodeURIComponent(tz)}&start_date=${date}&end_date=${date}`;
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

Deno.serve(async (req:Request)=>{
  if (req.method==='OPTIONS') return new Response('ok',{headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}});

  const supabase=createClient(SUPABASE_URL,SUPABASE_SERVICE_KEY);

  let body:{session_id:string;force_weather?:boolean;force_tides?:boolean};
  try { body=await req.json(); } catch { return new Response(JSON.stringify({error:'Invalid JSON'}),{status:400}); }

  const {session_id,force_weather=false,force_tides=false}=body;
  if (!session_id) return new Response(JSON.stringify({error:'session_id required'}),{status:400});

  const {data:session,error:sessErr}=await supabase.from('sessions').select('id,starts_at,ends_at,location').eq('id',session_id).maybeSingle();
  if (sessErr||!session) return new Response(JSON.stringify({error:'Session not found'}),{status:404});

  const sessionEnded=session.ends_at?new Date(session.ends_at)<new Date():new Date(session.starts_at)<new Date();
  const {data:existing}=await supabase.from('session_weather_cache').select('*').eq('session_id',session_id).maybeSingle();

  const needsWeather=!sessionEnded&&(force_weather||minutesSince(existing?.weather_updated_at)>=weatherIntervalMinutes(session.starts_at));
  // Tides are fetched once and never re-fetched. Only retry if: no tides AND
  // (never attempted OR attempted >24h ago) — this is a backstop for failed
  // fetches; the 1am daily-tide-refresh cron is the other backstop.
  const needsTides=force_tides||(!existing?.tides&&hoursSince(existing?.tides_fetch_attempted_at)>=24);

  if (!needsWeather&&!needsTides&&existing) {
    return new Response(JSON.stringify({session_id,weather:existing.weather,waves:existing.waves,tides:existing.tides,weather_updated_at:existing.weather_updated_at,tides_updated_at:existing.tides_updated_at,refreshed:false}),{headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
  }

  const location=session.location??'';
  const coords=existing?.lat&&existing?.lng?{lat:existing.lat,lng:existing.lng}:await geocode(location);
  const date=new Date(session.starts_at).toISOString().slice(0,10);
  const tz=getTimezone(coords.lat,coords.lng);
  const daysAway=daysUntil(session.starts_at);
  const tooFarForWeather=daysAway>16;
  const tooFarForWaves=daysAway>7;
  const useArchive=daysAway<=0;

  let newWeather=existing?.weather??null;
  let newWaves=existing?.waves??null;
  let newTides=existing?.tides??null;
  let weatherUpdatedAt=existing?.weather_updated_at??null;
  let tidesUpdatedAt=existing?.tides_updated_at??null;
  let tidesFetchAttemptedAt=existing?.tides_fetch_attempted_at??null;

  const fetches:Promise<void>[]=[];

  if (needsWeather&&!tooFarForWeather) {
    fetches.push(Promise.all([fetchWeather(coords.lat,coords.lng,date,tz),tooFarForWaves?Promise.resolve(null):fetchWaves(coords.lat,coords.lng,date,useArchive)]).then(([w,wv])=>{
      if (w!==null){newWeather=w;weatherUpdatedAt=new Date().toISOString();}
      if (wv!==null) newWaves=wv;
    }).catch(()=>{}));
  }

  if (needsTides) {
    tidesFetchAttemptedAt=new Date().toISOString();
    fetches.push(fetchTides(coords.lat,coords.lng,date).then((td)=>{
      if (td&&td.length>0){newTides=td;tidesUpdatedAt=new Date().toISOString();}
    }).catch(()=>{}));
  }

  await Promise.all(fetches);

  await supabase.from('session_weather_cache').upsert({
    session_id,lat:coords.lat,lng:coords.lng,
    weather:newWeather,waves:newWaves,tides:newTides,
    weather_updated_at:weatherUpdatedAt,tides_updated_at:tidesUpdatedAt,
    tides_fetch_attempted_at:tidesFetchAttemptedAt,
  },{onConflict:'session_id'});

  return new Response(JSON.stringify({session_id,weather:newWeather,waves:newWaves,tides:newTides,weather_updated_at:weatherUpdatedAt,tides_updated_at:tidesUpdatedAt,refreshed:true}),{headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
});
