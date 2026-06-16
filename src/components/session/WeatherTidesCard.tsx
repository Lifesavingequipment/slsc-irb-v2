import { useEffect, useState } from "react";
import { format } from "date-fns";

type WeatherData = {
  emoji: string;
  label: string;
  maxTemp: number;
  windDir: string;
  windSpeed: number;
};

type WaveData = {
  heightMax: number | null;
  periodMax: number | null;
  directionDominant: number | null;
  approx: boolean;
};

function daysUntilSession(startsAt: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sessionDate = new Date(startsAt);
  sessionDate.setHours(0, 0, 0, 0);
  return Math.round((sessionDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function degreesToCompass(deg: number): string {
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
}

function weatherCodeInfo(code: number): { emoji: string; label: string } {
  if (code === 0) return { emoji: "☀️", label: "Clear" };
  if (code <= 3) return { emoji: "⛅", label: "Partly cloudy" };
  if (code === 45 || code === 48) return { emoji: "🌫️", label: "Foggy" };
  if ([51, 53, 55, 61, 63, 65].includes(code)) return { emoji: "🌧️", label: "Rain" };
  if ([71, 73, 75, 77].includes(code)) return { emoji: "🌨️", label: "Snow" };
  if ([80, 81, 82].includes(code)) return { emoji: "🌦️", label: "Showers" };
  if ([95, 96, 99].includes(code)) return { emoji: "⛈️", label: "Thunderstorm" };
  return { emoji: "🌡️", label: "Cloudy" };
}

function getTimezone(lat: number, lng: number): string {
  if (lat >= -44 && lat <= -10 && lng >= 113 && lng <= 154) return "Australia/Brisbane";
  if (lat >= -47 && lat <= -34 && lng >= 166 && lng <= 178) return "Pacific/Auckland";
  return "auto";
}

const GOLD_COAST_FALLBACK = { lat: -28.0167, lng: 153.4 };

async function geocode(location: string): Promise<{ lat: number; lng: number }> {
  const m = location.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
  if (m) {
    const coords = { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    console.log("[WeatherTidesCard] geocode: matched lat/lng directly", coords);
    return coords;
  }
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`;
  console.log("[WeatherTidesCard] geocode: fetching", url);
  try {
    const res = await fetch(url, { headers: { "User-Agent": "SLSC-IRB-App/1.0" } });
    const data = await res.json();
    console.log("[WeatherTidesCard] geocode: response", data);
    if (data?.[0]) {
      const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      console.log("[WeatherTidesCard] geocode: resolved", coords);
      return coords;
    }
    console.warn("[WeatherTidesCard] geocode: no results, falling back to Gold Coast coords");
  } catch (err) {
    console.error("[WeatherTidesCard] geocode: error", err);
  }
  return GOLD_COAST_FALLBACK;
}

async function fetchWeather(
  lat: number,
  lng: number,
  date: string,
  timezone: string,
): Promise<WeatherData | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=temperature_2m_max,weathercode,windspeed_10m_max,winddirection_10m_dominant` +
    `&timezone=${encodeURIComponent(timezone)}&start_date=${date}&end_date=${date}`;
  console.log("[WeatherTidesCard] fetchWeather: fetching", url);
  try {
    const res = await fetch(url);
    const d = await res.json();
    console.log("[WeatherTidesCard] fetchWeather: response", d);
    if (!d?.daily) {
      console.warn("[WeatherTidesCard] fetchWeather: no daily data in response");
      return null;
    }
    const { weathercode, temperature_2m_max, windspeed_10m_max, winddirection_10m_dominant } = d.daily;
    const { emoji, label } = weatherCodeInfo(weathercode?.[0] ?? 0);
    const result = {
      emoji,
      label,
      maxTemp: Math.round(temperature_2m_max?.[0] ?? 0),
      windDir: degreesToCompass(winddirection_10m_dominant?.[0] ?? 0),
      windSpeed: Math.round(windspeed_10m_max?.[0] ?? 0),
    };
    console.log("[WeatherTidesCard] fetchWeather: result", result);
    return result;
  } catch (err) {
    console.error("[WeatherTidesCard] fetchWeather: error", err);
  }
  return null;
}

async function fetchWaveOnce(
  lat: number,
  lng: number,
  date: string,
  useArchive = false,
): Promise<{ heightMax: number | null; periodMax: number | null; directionDominant: number | null } | null> {
  const baseUrl = useArchive
    ? "https://archive-api.open-meteo.com/v1/archive"
    : "https://marine-api.open-meteo.com/v1/marine";
  const url =
    `${baseUrl}?latitude=${lat}&longitude=${lng}` +
    `&daily=wave_height_max,wave_period_max,wave_direction_dominant` +
    `&timezone=auto&start_date=${date}&end_date=${date}`;
  console.log("[WeatherTidesCard] marine API URL:", url);
  try {
    const res = await fetch(url);
    const d = await res.json();
    console.log("[WeatherTidesCard] marine API response:", d);
    if (!d?.daily) {
      console.warn("[WeatherTidesCard] fetchWaveOnce: no daily data in response");
      return null;
    }
    const heightMax: number | null = d.daily.wave_height_max?.[0] ?? null;
    const periodMax: number | null = d.daily.wave_period_max?.[0] ?? null;
    const directionDominant: number | null = d.daily.wave_direction_dominant?.[0] ?? null;
    console.log("[WeatherTidesCard] fetchWaveOnce: parsed values", { heightMax, periodMax, directionDominant });
    // Return data even when values are null — UI shows "—" rather than hiding the section
    return { heightMax, periodMax, directionDominant };
  } catch (err) {
    console.error("[WeatherTidesCard] fetchWaveOnce: error", err);
  }
  return null;
}

async function fetchWaves(
  lat: number,
  lng: number,
  date: string,
  useArchive = false,
): Promise<WaveData | null> {
  let lastResult: { heightMax: number | null; periodMax: number | null; directionDominant: number | null } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const shiftedLng = Math.round((lng + attempt * 0.5) * 10000) / 10000;
    const shiftedLat = attempt >= 2 ? Math.round((lat - 0.1) * 10000) / 10000 : lat;
    console.log(`[WeatherTidesCard] fetchWaves: attempt ${attempt + 1}/5, coords`, { lat: shiftedLat, lng: shiftedLng });
    const result = await fetchWaveOnce(shiftedLat, shiftedLng, date, useArchive);
    if (result) {
      lastResult = result;
      if (result.heightMax != null) {
        return { ...result, approx: attempt > 0 };
      }
      console.log(`[WeatherTidesCard] fetchWaves: attempt ${attempt + 1} returned null heightMax, retrying...`);
    } else {
      console.log(`[WeatherTidesCard] fetchWaves: attempt ${attempt + 1} returned no data, retrying...`);
    }
  }
  // All retries exhausted; return last response (with null heightMax) so UI can show fallback
  if (lastResult) return { ...lastResult, approx: true };
  return null;
}

export type WeatherTidesState = {
  loading: boolean;
  weather: WeatherData | null;
  waves: WaveData | null;
  tooFarForWeather: boolean;
  tooFarForWaves: boolean;
  error: string | null;
};

export function useWeatherTidesData({
  sessionId,
  location,
  startsAt,
}: {
  sessionId: string;
  location: string | null;
  startsAt: string;
}): WeatherTidesState {
  const daysUntil = daysUntilSession(startsAt);
  const tooFarForWaves = daysUntil > 7;
  const tooFarForWeather = daysUntil > 16;
  const useArchive = daysUntil <= 0;

  const [loading, setLoading] = useState(true);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [waves, setWaves] = useState<WaveData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const date = format(new Date(startsAt), "yyyy-MM-dd");
    const cacheKey = `weather-tides-${sessionId}-${location}`;

    if (!location) {
      setLoading(false);
      return;
    }

    if (tooFarForWeather && tooFarForWaves) {
      setLoading(false);
      return;
    }

    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setWeather(parsed.weather ?? null);
        setWaves(parsed.waves ?? null);
        setLoading(false);
        return;
      } catch { /* bad cache */ }
    }

    (async () => {
      try {
        const coords = await geocode(location);
        const tz = getTimezone(coords.lat, coords.lng);
        const [w, wv] = await Promise.all([
          tooFarForWeather ? Promise.resolve(null) : fetchWeather(coords.lat, coords.lng, date, tz),
          tooFarForWaves ? Promise.resolve(null) : fetchWaves(coords.lat, coords.lng, date, useArchive),
        ]);
        setWeather(w);
        setWaves(wv);
        sessionStorage.setItem(cacheKey, JSON.stringify({ weather: w, waves: wv }));
        if (!w && !wv && !tooFarForWeather && !tooFarForWaves) {
          setError("Weather data unavailable for this location.");
        }
      } catch (err) {
        setError(`Failed to load weather data: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId, location, startsAt]);

  return { loading, weather, waves, tooFarForWeather, tooFarForWaves, error };
}

export { degreesToCompass };
