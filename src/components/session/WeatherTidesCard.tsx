import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";

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

export function WeatherTidesCard({
  sessionId,
  location,
  startsAt,
  canManage = false,
}: {
  sessionId: string;
  location: string | null;
  startsAt: string;
  canManage?: boolean;
}) {
  const daysUntil = daysUntilSession(startsAt);
  const tooFarForWaves = daysUntil > 7;
  const tooFarForWeather = daysUntil > 16;
  const useArchive = daysUntil <= 0;

  const [loading, setLoading] = useState(true);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [waves, setWaves] = useState<WaveData | null>(null);
  const [timezone, setTimezone] = useState<string>("auto");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const date = format(new Date(startsAt), "yyyy-MM-dd");
    const cacheKey = `weather-tides-${sessionId}-${location}`;

    if (!location) {
      setLoading(false);
      return;
    }

    // Nothing to fetch if both are out of range
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
        setTimezone(parsed.timezone ?? "auto");
        setLoading(false);
        console.log("[WeatherTidesCard] loaded from cache", parsed);
        return;
      } catch { /* bad cache */ }
    }

    console.log("[WeatherTidesCard] starting fetch for location:", location, "date:", date, "daysUntil:", daysUntil);

    (async () => {
      try {
        const coords = await geocode(location);
        console.log("[WeatherTidesCard] using coords", coords);
        const tz = getTimezone(coords.lat, coords.lng);
        const [w, wv] = await Promise.all([
          tooFarForWeather ? Promise.resolve(null) : fetchWeather(coords.lat, coords.lng, date, tz),
          tooFarForWaves ? Promise.resolve(null) : fetchWaves(coords.lat, coords.lng, date, useArchive),
        ]);
        setWeather(w);
        setWaves(wv);
        setTimezone(tz);
        sessionStorage.setItem(cacheKey, JSON.stringify({ weather: w, waves: wv, timezone: tz }));
        console.log("[WeatherTidesCard] fetch complete", { weather: w, waves: wv, timezone: tz });
        if (!w && !wv && !tooFarForWeather && !tooFarForWaves) {
          setError("Weather and wave data unavailable for this location.");
        }
      } catch (err) {
        console.error("[WeatherTidesCard] unexpected error", err);
        setError(`Failed to load weather data: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId, location, startsAt]);

  if (loading) {
    return <Card className="mt-4 p-4 h-16 animate-pulse bg-muted/30" />;
  }

  if (!location) {
    return (
      <Card className="mt-4 p-4">
        <p className="text-sm text-muted-foreground">
          📍 Add a location to this session to see weather and tides.
          {canManage && (
            <>
              {" "}
              <Link
                to="/sessions/$sessionId/edit"
                params={{ sessionId }}
                className="text-primary underline"
              >
                Edit session
              </Link>
            </>
          )}
        </p>
      </Card>
    );
  }

  // Both weather and wave forecasts are out of range (> 16 days out)
  if (tooFarForWeather && tooFarForWaves) {
    return (
      <Card className="mt-4 p-4">
        <div className="space-y-0.5 text-sm text-muted-foreground">
          <p>Weather forecast not yet available.</p>
          <p className="text-xs">Surf forecast available 7 days before session.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mt-4 p-4">
      <div className="space-y-1.5 text-sm">
        {tooFarForWeather ? (
          <p className="text-xs text-muted-foreground">Weather forecast not yet available.</p>
        ) : weather ? (
          <div>
            {weather.emoji} {weather.label} · {weather.maxTemp}°C · {weather.windDir} {weather.windSpeed} km/h
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {error ?? "Weather data unavailable for this location."}
          </p>
        )}
        {!tooFarForWaves && (
          <div className="text-muted-foreground">
            🌊 Surf:{" "}
            {waves?.heightMax != null
              ? `~${Math.round(waves.heightMax * 10) / 10}m`
              : waves != null
                ? "Approx. surf — coastal data unavailable"
                : "—"}
            {waves?.periodMax != null ? ` · ${Math.round(waves.periodMax)}s period` : ""}
            {waves?.directionDominant != null ? ` · ${degreesToCompass(waves.directionDominant)}` : ""}
            {waves?.approx ? " (approx.)" : ""}
          </div>
        )}
        {tooFarForWaves && (
          <p className="text-xs text-muted-foreground">Surf forecast available 7 days before session.</p>
        )}
      </div>
    </Card>
  );
}
