import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type WeatherData = {
  emoji: string;
  label: string;
  maxTemp: number;
  windDir: string;
  windSpeed: number;
  uvIndex: number | null;
};

type WaveData = {
  heightMax: number | null;
  periodMax: number | null;
  directionDominant: number | null;
  approx: boolean;
};

export type TideExtreme = {
  time: string;
  type: "High" | "Low";
  height: number;
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

export type WeatherTidesState = {
  loading: boolean;
  weather: WeatherData | null;
  waves: WaveData | null;
  tides: TideExtreme[] | null;
  tooFarForWeather: boolean;
  tooFarForWaves: boolean;
  weatherUpdatedAt: string | null;
};

// Reads weather/surf/tides for a session straight out of session_weather_cache.
// All fetching happens server-side: tides are populated once at session
// creation (with the 1am daily-tide-refresh cron as a backstop), and
// weather/waves are refreshed hourly for sessions in the next 7 days by the
// hourly-weather-refresh function. The frontend never calls a live API.
export function useWeatherTidesData({
  sessionId,
  startsAt,
}: {
  sessionId: string;
  startsAt: string;
}): WeatherTidesState {
  const daysUntil = daysUntilSession(startsAt);
  const tooFarForWaves = daysUntil > 7;
  const tooFarForWeather = daysUntil > 16;

  const [loading, setLoading] = useState(true);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [waves, setWaves] = useState<WaveData | null>(null);
  const [tides, setTides] = useState<TideExtreme[] | null>(null);
  const [weatherUpdatedAt, setWeatherUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("session_weather_cache")
      .select("weather, waves, tides, weather_updated_at")
      .eq("session_id", sessionId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setWeather((data?.weather as WeatherData) ?? null);
        setWaves((data?.waves as WaveData) ?? null);
        setTides((data?.tides as TideExtreme[]) ?? null);
        setWeatherUpdatedAt(data?.weather_updated_at ?? null);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [sessionId]);

  return { loading, weather, waves, tides, tooFarForWeather, tooFarForWaves, weatherUpdatedAt };
}

export type LocationConditionsState = {
  loading: boolean;
  weather: WeatherData | null;
  waves: WaveData | null;
  tides: TideExtreme[] | null;
  weatherUpdatedAt: string | null;
};

// Reads today's weather/surf/tides for a club's home location straight out of
// location_weather_cache, populated by the hourly-weather-refresh (weather,
// waves) and daily-tide-refresh (tides) functions.
export function useLocationWeatherData({ locationId }: { locationId: string }): LocationConditionsState {
  const [loading, setLoading] = useState(true);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [waves, setWaves] = useState<WaveData | null>(null);
  const [tides, setTides] = useState<TideExtreme[] | null>(null);
  const [weatherUpdatedAt, setWeatherUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("location_weather_cache")
      .select("weather, waves, tides, weather_updated_at")
      .eq("location_id", locationId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setWeather((data?.weather as WeatherData) ?? null);
        setWaves((data?.waves as WaveData) ?? null);
        setTides((data?.tides as TideExtreme[]) ?? null);
        setWeatherUpdatedAt(data?.weather_updated_at ?? null);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [locationId]);

  return { loading, weather, waves, tides, weatherUpdatedAt };
}

export { degreesToCompass };
