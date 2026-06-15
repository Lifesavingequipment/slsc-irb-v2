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
  times: string[];
  heights: (number | null)[];
  approx: boolean;
};

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

function hourLabel(hour: number): string {
  if (hour < 12) return "morning";
  if (hour < 14) return "midday";
  if (hour < 18) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

function getTimezone(lat: number, lng: number): string {
  if (lat >= -44 && lat <= -10 && lng >= 113 && lng <= 154) return "Australia/Brisbane";
  if (lat >= -47 && lat <= -34 && lng >= 166 && lng <= 178) return "Pacific/Auckland";
  return "auto";
}

function getLocalHour(dateStr: string, timezone: string): number {
  const date = new Date(dateStr);
  if (timezone === "auto") return date.getHours();
  try {
    const fmt = new Intl.DateTimeFormat("en-AU", { timeZone: timezone, hour: "numeric", hour12: false });
    const h = parseInt(fmt.format(date), 10);
    return isNaN(h) ? date.getHours() : h;
  } catch {
    return date.getHours();
  }
}

function buildWaveSegments(
  waves: WaveData,
  startsAt: string,
  timezone: string,
): { height: number; label: string }[] {
  const startHour = getLocalHour(startsAt, timezone);
  const segments: { height: number; label: string }[] = [];
  for (const offset of [0, 2]) {
    const targetHour = (startHour + offset) % 24;
    const timeStr = `T${targetHour.toString().padStart(2, "0")}:00`;
    const idx = waves.times.findIndex((t) => t.includes(timeStr));
    if (idx !== -1 && waves.heights[idx] != null) {
      segments.push({
        height: Math.round((waves.heights[idx] as number) * 10) / 10,
        label: hourLabel(targetHour),
      });
    }
  }
  return segments;
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
  timezone: string,
): Promise<{ times: string[]; heights: (number | null)[] } | null> {
  const url =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}` +
    `&hourly=wave_height&timezone=${encodeURIComponent(timezone)}&start_date=${date}&end_date=${date}`;
  console.log("[WeatherTidesCard] fetchWaveOnce: fetching", url);
  try {
    const res = await fetch(url);
    const d = await res.json();
    console.log("[WeatherTidesCard] fetchWaveOnce: response", d);
    const heights: (number | null)[] = d?.hourly?.wave_height ?? [];
    const times: string[] = d?.hourly?.time ?? [];
    if (heights.length < 3) {
      console.warn("[WeatherTidesCard] fetchWaveOnce: insufficient data points", heights.length);
      return null;
    }
    if (heights.every((h) => h == null)) {
      console.warn("[WeatherTidesCard] fetchWaveOnce: all wave heights null — inland location, lng:", lng);
      return null;
    }
    return { times, heights };
  } catch (err) {
    console.error("[WeatherTidesCard] fetchWaveOnce: error", err);
  }
  return null;
}

async function fetchWaves(
  lat: number,
  lng: number,
  date: string,
  timezone: string,
): Promise<WaveData | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const shiftedLng = Math.round((lng + attempt * 0.3) * 10000) / 10000;
    const result = await fetchWaveOnce(lat, shiftedLng, date, timezone);
    if (result) return { ...result, approx: attempt > 0 };
    if (attempt < 2) {
      console.log(
        `[WeatherTidesCard] fetchWaves: attempt ${attempt + 1} failed, shifting lng +0.3 to ${shiftedLng + 0.3}`,
      );
    }
  }
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

    console.log("[WeatherTidesCard] starting fetch for location:", location, "date:", date);

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

    (async () => {
      try {
        const coords = await geocode(location);
        console.log("[WeatherTidesCard] using coords", coords);
        const tz = getTimezone(coords.lat, coords.lng);
        const [w, wv] = await Promise.all([
          fetchWeather(coords.lat, coords.lng, date, tz),
          fetchWaves(coords.lat, coords.lng, date, tz),
        ]);
        setWeather(w);
        setWaves(wv);
        setTimezone(tz);
        sessionStorage.setItem(cacheKey, JSON.stringify({ weather: w, waves: wv, timezone: tz }));
        console.log("[WeatherTidesCard] fetch complete", { weather: w, waves: wv, timezone: tz });
        if (!w && !wv) {
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

  if (!weather && !waves) {
    return (
      <Card className="mt-4 p-4">
        <p className="text-sm text-destructive">
          ⚠️ {error ?? "No weather or wave data returned. Check console for details."}
        </p>
      </Card>
    );
  }

  const waveSegments = waves ? buildWaveSegments(waves, startsAt, timezone) : [];

  return (
    <Card className="mt-4 p-4">
      <div className="space-y-1.5 text-sm">
        {weather && (
          <div>
            {weather.emoji} {weather.label} · {weather.maxTemp}°C · {weather.windDir} {weather.windSpeed} km/h
          </div>
        )}
        {waveSegments.length > 0 && (
          <div className="text-muted-foreground">
            🌊 Wave {waveSegments.map((s) => `~${s.height}m (${s.label})`).join(" · ")}
            {waves?.approx ? " (approx.)" : ""}
          </div>
        )}
      </div>
    </Card>
  );
}
