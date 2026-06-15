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

type TidePoint = { time: string; height: number };
type TidesData = { highs: TidePoint[]; lows: TidePoint[] };

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

function formatHour(isoStr: string): string {
  const timePart = isoStr.split("T")[1] ?? "00:00";
  const [hStr] = timePart.split(":");
  const h = parseInt(hStr, 10);
  return `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
}

async function geocode(location: string): Promise<{ lat: number; lng: number } | null> {
  const m = location.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`,
      { headers: { "User-Agent": "slsc-irb-v2/1.0" } },
    );
    const data = await res.json();
    if (data?.[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch { /* */ }
  return null;
}

async function fetchWeather(lat: number, lng: number, date: string): Promise<WeatherData | null> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&daily=temperature_2m_max,weathercode,windspeed_10m_max,winddirection_10m_dominant` +
      `&timezone=auto&start_date=${date}&end_date=${date}`,
    );
    const d = await res.json();
    if (!d?.daily) return null;
    const { weathercode, temperature_2m_max, windspeed_10m_max, winddirection_10m_dominant } = d.daily;
    const { emoji, label } = weatherCodeInfo(weathercode?.[0] ?? 0);
    return {
      emoji,
      label,
      maxTemp: Math.round(temperature_2m_max?.[0] ?? 0),
      windDir: degreesToCompass(winddirection_10m_dominant?.[0] ?? 0),
      windSpeed: Math.round(windspeed_10m_max?.[0] ?? 0),
    };
  } catch { /* */ }
  return null;
}

async function fetchTides(lat: number, lng: number, date: string): Promise<TidesData | null> {
  try {
    const res = await fetch(
      `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}` +
      `&hourly=wave_height&timezone=auto&start_date=${date}&end_date=${date}`,
    );
    const d = await res.json();
    const heights: (number | null)[] = d?.hourly?.wave_height ?? [];
    const times: string[] = d?.hourly?.time ?? [];
    if (heights.length < 3) return null;

    const highs: TidePoint[] = [];
    const lows: TidePoint[] = [];
    for (let i = 1; i < heights.length - 1; i++) {
      const p = heights[i - 1], c = heights[i], n = heights[i + 1];
      if (p == null || c == null || n == null) continue;
      if (c > p && c > n) highs.push({ height: Math.round(c * 10) / 10, time: times[i] });
      else if (c < p && c < n) lows.push({ height: Math.round(c * 10) / 10, time: times[i] });
    }

    highs.sort((a, b) => b.height - a.height);
    lows.sort((a, b) => a.height - b.height);
    if (highs.length === 0 && lows.length === 0) return null;
    return { highs: highs.slice(0, 2), lows: lows.slice(0, 2) };
  } catch { /* */ }
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
  const [tides, setTides] = useState<TidesData | null>(null);

  useEffect(() => {
    const date = format(new Date(startsAt), "yyyy-MM-dd");
    const cacheKey = `weather-tides-${sessionId}`;

    if (!location) {
      setLoading(false);
      return;
    }

    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const { weather: w, tides: t } = JSON.parse(cached);
        setWeather(w);
        setTides(t);
        setLoading(false);
        return;
      } catch { /* bad cache */ }
    }

    (async () => {
      const coords = await geocode(location);
      if (!coords) {
        setLoading(false);
        return;
      }
      const [w, t] = await Promise.all([
        fetchWeather(coords.lat, coords.lng, date),
        fetchTides(coords.lat, coords.lng, date),
      ]);
      setWeather(w);
      setTides(t);
      sessionStorage.setItem(cacheKey, JSON.stringify({ weather: w, tides: t }));
      setLoading(false);
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

  if (!weather && !tides) return null;

  const tideSegments: string[] = [];
  if (tides) {
    const allPoints = [
      ...tides.highs.map((h) => ({ ...h, type: "High" as const })),
      ...tides.lows.map((l) => ({ ...l, type: "Low" as const })),
    ].sort((a, b) => a.time.localeCompare(b.time));
    for (const pt of allPoints) {
      tideSegments.push(`${pt.type} ~${pt.height}m at ${formatHour(pt.time)}`);
    }
  }

  return (
    <Card className="mt-4 p-4">
      <div className="space-y-1.5 text-sm">
        {weather && (
          <div>
            {weather.emoji} {weather.label} · {weather.maxTemp}°C · {weather.windDir} {weather.windSpeed} km/h
          </div>
        )}
        {tideSegments.length > 0 && (
          <div className="text-muted-foreground">
            🌊 {tideSegments.join(" · ")}
          </div>
        )}
      </div>
    </Card>
  );
}
