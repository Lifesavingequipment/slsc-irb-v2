import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, startOfWeek, endOfWeek, addWeeks, addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useClub, useCanManage } from "@/lib/club-context";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Plus, Users, X } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";
import { SessionsCalendar } from "@/components/session/SessionsCalendar";

export const Route = createFileRoute("/_app/sessions/")({
  head: () => ({ meta: [{ title: "Sessions — IRB Coaching" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    filter: search.filter === "surveys-pending" || search.filter === "rsvp-pending"
      ? (search.filter as "surveys-pending" | "rsvp-pending")
      : undefined,
  }),
  component: SessionsList,
});

type Row = {
  id: string; title: string; starts_at: string; location: string | null;
  session_type: string; format: string | null; survey_enabled: boolean;
};

// Module-level cache keyed by `${clubId}:${tab}` so navigating back/forward
// doesn't blank the list while a fresh fetch is in flight.
type CacheEntry = { rows: Row[]; myRsvps: Record<string, string>; goingCounts: Record<string, number> };
const sessionsCache = new Map<string, CacheEntry>();
const cacheKey = (clubId: string, tab: "upcoming" | "past") => `${clubId}:${tab}`;

/** Clear cached sessions list so the next mount fetches fresh data. */
export function invalidateSessionsCache(clubId?: string) {
  if (!clubId) { sessionsCache.clear(); return; }
  sessionsCache.delete(cacheKey(clubId, "upcoming"));
  sessionsCache.delete(cacheKey(clubId, "past"));
}

type SessionsListListener = () => void;
const sessionsListListeners = new Set<SessionsListListener>();

/** Optimistically remove a session from every cached tab and notify any mounted list. */
export function removeSessionFromCache(clubId: string, sessionId: string) {
  for (const tab of ["upcoming", "past"] as const) {
    const key = cacheKey(clubId, tab);
    const entry = sessionsCache.get(key);
    if (!entry) continue;
    const rows = entry.rows.filter((r) => r.id !== sessionId);
    const { [sessionId]: _omitRsvp, ...myRsvps } = entry.myRsvps;
    const { [sessionId]: _omitCount, ...goingCounts } = entry.goingCounts;
    sessionsCache.set(key, { rows, myRsvps, goingCounts });
  }
  sessionsListListeners.forEach((fn) => fn());
}

export function subscribeToSessionsList(fn: SessionsListListener) {
  sessionsListListeners.add(fn);
  return () => { sessionsListListeners.delete(fn); };
}

type TabKey = "upcoming" | "this_week" | "next_week" | "calendar" | "past";
const TAB_LABELS: Record<TabKey, string> = {
  upcoming: "Upcoming",
  this_week: "This week",
  next_week: "Next week",
  calendar: "Calendar",
  past: "Past",
};

function SessionsList() {
  const { activeClub } = useClub();
  const { user } = useAuth();
  const canManage = useCanManage();
  const { filter } = Route.useSearch();
  const [tab, setTab] = useState<TabKey>("upcoming");
  // Cache only "upcoming" and "past" — the week views derive from upcoming rows in memory.
  const fetchTab: "upcoming" | "past" = tab === "past" ? "past" : "upcoming";
  const initial = activeClub ? sessionsCache.get(cacheKey(activeClub.club_id, fetchTab)) : undefined;
  const [rows, setRows] = useState<Row[]>(initial?.rows ?? []);
  const [myRsvps, setMyRsvps] = useState<Record<string, string>>(initial?.myRsvps ?? {});
  const [goingCounts, setGoingCounts] = useState<Record<string, number>>(initial?.goingCounts ?? {});
  const [loaded, setLoaded] = useState<boolean>(!!initial);
  const [weatherMap, setWeatherMap] = useState<Record<string, { weather: unknown; waves: unknown; tides: unknown }>>({});

  const cancelledRef = useRef(false);
  const load = useCallback(async () => {
    if (!activeClub || !user) return;
    cancelledRef.current = false;
    const nowIso = new Date().toISOString();
    const base = supabase
      .from("sessions")
      .select("id, title, starts_at, location, session_type, format, ends_at, survey_enabled")
      .eq("club_id", activeClub.club_id);
    const { data } = fetchTab === "upcoming"
      ? await base
          .or(`ends_at.gte.${nowIso},and(ends_at.is.null,starts_at.gte.${nowIso})`)
          .order("starts_at", { ascending: true })
      : await base
          .or(`ends_at.lt.${nowIso},and(ends_at.is.null,starts_at.lt.${nowIso})`)
          .order("starts_at", { ascending: false })
          .limit(50);
    if (cancelledRef.current) return;
    const list = (data ?? []) as Row[];
    const ids = list.map((r) => r.id);
    const [{ data: rsvps }, { data: counts }, { data: weatherData }] = await Promise.all([
      supabase.from("session_rsvps").select("session_id, status").eq("user_id", user.id),
      ids.length
        ? supabase.from("session_rsvps").select("session_id").in("session_id", ids).eq("status", "going")
        : Promise.resolve({ data: [] as { session_id: string }[] }),
      ids.length
        ? supabase.from("session_weather_cache").select("session_id, weather, waves, tides").in("session_id", ids)
        : Promise.resolve({ data: [] as { session_id: string; weather: unknown; waves: unknown; tides: unknown }[] }),
    ]);
    if (cancelledRef.current) return;
    const map: Record<string, string> = {};
    (rsvps ?? []).forEach((r) => { map[r.session_id] = r.status; });
    const cmap: Record<string, number> = {};
    (counts ?? []).forEach((r) => { cmap[r.session_id] = (cmap[r.session_id] ?? 0) + 1; });
    const wmap: Record<string, { weather: unknown; waves: unknown; tides: unknown }> = {};
    (weatherData ?? []).forEach((w) => { wmap[w.session_id] = w; });
    setRows(list);
    setMyRsvps(map);
    setGoingCounts(cmap);
    setWeatherMap(wmap);
    setLoaded(true);
    sessionsCache.set(cacheKey(activeClub.club_id, fetchTab), {
      rows: list, myRsvps: map, goingCounts: cmap,
    });
  }, [activeClub?.club_id, user?.id, fetchTab]);


  useEffect(() => {
    if (!activeClub || !user) return;
    const cached = sessionsCache.get(cacheKey(activeClub.club_id, fetchTab));
    if (cached) {
      setRows(cached.rows);
      setMyRsvps(cached.myRsvps);
      setGoingCounts(cached.goingCounts);
    }
    load();
    return () => { cancelledRef.current = true; };
  }, [activeClub?.club_id, user?.id, fetchTab, load]);

  useRefetchOnFocus(load);

  useEffect(() => {
    if (!activeClub) return;
    return subscribeToSessionsList(() => {
      const cached = sessionsCache.get(cacheKey(activeClub.club_id, fetchTab));
      if (cached) {
        setRows(cached.rows);
        setMyRsvps(cached.myRsvps);
        setGoingCounts(cached.goingCounts);
      }
    });
  }, [activeClub?.club_id, fetchTab]);

  // Derive the visible list based on the selected tab.
  const visibleRows = useMemo(() => {
    if (tab === "upcoming" || tab === "past" || tab === "calendar") return rows;
    const now = new Date();
    const weekStart = startOfWeek(tab === "this_week" ? now : addWeeks(now, 1), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    return rows.filter((r) => {
      const t = new Date(r.starts_at).getTime();
      return t >= weekStart.getTime() && t <= weekEnd.getTime();
    });
  }, [rows, tab]);

  // Apply filter from URL search params on top of the tab-derived list.
  const filteredRows = useMemo(() => {
    if (!filter) return visibleRows;
    if (filter === "rsvp-pending") {
      const in7Iso = addDays(new Date(), 7).toISOString();
      return visibleRows.filter((r) => !myRsvps[r.id] && r.starts_at <= in7Iso);
    }
    if (filter === "surveys-pending") return visibleRows.filter((r) => r.survey_enabled);
    return visibleRows;
  }, [visibleRows, filter, myRsvps]);


  return (
    <AppShell
      action={canManage ? (
        <Button asChild size="sm" variant="secondary" className="h-9">
          <Link to="/sessions/new"><Plus className="h-4 w-4 mr-1" /> New</Link>
        </Button>
      ) : undefined}
    >
      <h1 className="text-2xl font-bold mb-3">Sessions</h1>

      {filter && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-muted text-sm">
          <span className="flex-1 font-medium">
            {filter === "surveys-pending" ? "Showing sessions with pending surveys" : "Showing sessions with pending RSVPs"}
          </span>
          <Link to="/sessions" search={{}} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </Link>
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto -mx-1 px-1 mb-4 pb-1">
        {(Object.keys(TAB_LABELS) as TabKey[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap px-4 py-2 min-h-[36px] text-sm font-medium rounded-full transition-colors ${
              tab === t ? "bg-card border border-border shadow-sm text-foreground" : "bg-muted text-muted-foreground"
            }`}
          >{TAB_LABELS[t]}</button>
        ))}
      </div>

      {tab === "calendar" ? (
        <SessionsCalendar rows={rows} />
      ) : !loaded && filteredRows.length === 0 ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="p-4 h-24 animate-pulse bg-muted/30" />
          ))}
        </div>
      ) : filteredRows.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-5 w-5" />}
          title={
            filter === "surveys-pending" ? "No sessions with pending surveys"
              : filter === "rsvp-pending" ? "No sessions with pending RSVPs"
              : tab === "past" ? "No past sessions"
              : tab === "this_week" ? "Nothing on this week"
              : tab === "next_week" ? "Nothing on next week"
              : "No upcoming sessions"
          }
          description={filter
            ? "Nothing matched this filter."
            : tab === "upcoming" || tab === "this_week" || tab === "next_week"
            ? "Sessions are how crews coordinate training, races, and patrols. Schedule one so members can RSVP and sort carpools."
            : "Completed sessions will show up here once they've finished."}
          action={!filter && tab !== "past" && canManage ? (
            <Button asChild>
              <Link to="/sessions/new">
                <Plus className="h-4 w-4 mr-1" /> Schedule a session
              </Link>
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-3">
          {filteredRows.map((s) => (
            <Link key={s.id} to="/sessions/$sessionId" params={{ sessionId: s.id }}>
              <Card className="p-4 hover:border-accent transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="secondary" className="text-[10px] uppercase">{s.session_type}</Badge>
                  {s.format && (
                    <Badge variant="outline" className="text-[10px] uppercase">{s.format}</Badge>
                  )}
                  {myRsvps[s.id] === "going" && (
                    <Badge className="bg-success text-success-foreground text-[10px] uppercase">Going</Badge>
                  )}
                  {myRsvps[s.id] === "maybe" && (
                    <Badge className="bg-warning text-warning-foreground text-[10px] uppercase">Maybe</Badge>
                  )}
                </div>
                <div className="font-semibold">{s.title}</div>
                <div className="mt-1 text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(s.starts_at), "EEE d MMM · h:mma")}
                  </span>
                  {s.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {s.location.split(" — ")[0]}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" /> {goingCounts[s.id] ?? 0} going
                  </span>
                </div>
                {tab !== "past" && weatherMap[s.id] && (() => {
                  const wc = weatherMap[s.id];
                  const weather = wc.weather as { emoji?: string; maxTemp?: number; windSpeed?: number; windDir?: string } | null;
                  const waves = wc.waves as { heightMax?: number } | null;
                  const tides = wc.tides as { type: string; height: number; time: string }[] | null;

                  const hasWeather = weather?.maxTemp != null;
                  const hasWaves = waves?.heightMax != null;
                  const hasTides = tides && tides.length > 0;

                  if (!hasWeather && !hasWaves && !hasTides) return null;

                  const htEntries = tides?.filter((t) => t.type === "High") ?? [];
                  const ltEntries = tides?.filter((t) => t.type === "Low") ?? [];

                  return (
                    <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                      {hasWeather && (
                        <span>{weather!.emoji} {weather!.maxTemp}°C · {weather!.windSpeed}km/h {weather!.windDir}</span>
                      )}
                      {hasWaves && (
                        <span>🌊 {waves!.heightMax!.toFixed(1)}m</span>
                      )}
                      {hasTides && (
                        <span>
                          {htEntries.length > 0 && `HT: ${htEntries.map((t) => t.time).join(", ")}`}
                          {htEntries.length > 0 && ltEntries.length > 0 && " · "}
                          {ltEntries.length > 0 && `LT: ${ltEntries.map((t) => t.time).join(", ")}`}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
