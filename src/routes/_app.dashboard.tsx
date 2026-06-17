import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { addDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useClub, useCanManage, useIsAdmin } from "@/lib/club-context";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Plus, Users, UserPlus, Shield, ClipboardList, CheckCircle2, Dumbbell, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useIsPlatformOwner } from "@/lib/platform-owner";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";
import { useMemberFirstName } from "@/hooks/useMemberFirstName";
import { useWeatherTidesData } from "@/components/session/WeatherTidesCard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — IRB Coaching" }] }),
  component: Dashboard,
});

type Upcoming = {
  id: string; title: string; starts_at: string; location: string | null; session_type: string;
};

function Dashboard() {
  const { user } = useAuth();
  const { activeClub } = useClub();
  const canManage = useCanManage();
  const isAdmin = useIsAdmin();
  const isPlatformOwner = useIsPlatformOwner();
  const firstName = useMemberFirstName();

  const [upcoming, setUpcoming] = useState<Upcoming[]>([]);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [myRsvps, setMyRsvps] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  // Next 7 days action summary
  const [next7, setNext7] = useState<{
    trainingCount: number;
    rsvpsPending: number;
    surveysPending: number;
  }>({ trainingCount: 0, rsvpsPending: 0, surveysPending: 0 });

  const refreshAll = async () => {
    if (!activeClub || !user) return;
    const nowIso = new Date().toISOString();
    const in7Iso = addDays(new Date(), 7).toISOString();
    const [sess, members, memberRows, clubMems, rsvps, next7Sess] = await Promise.all([
      supabase.from("sessions")
        .select("id, title, starts_at, location, session_type, ends_at")
        .eq("club_id", activeClub.club_id)
        .or(`ends_at.gte.${nowIso},and(ends_at.is.null,starts_at.gte.${nowIso})`)
        .order("starts_at", { ascending: true })
        .limit(5),
      supabase.from("members").select("id", { count: "exact", head: true })
        .eq("club_id", activeClub.club_id).eq("membership_status", "active"),
      // Pending count must mirror the Members page Pending tab exactly. The
      // authoritative status lives in club_memberships; members.membership_status
      // can be stale (e.g. an approved member whose members row still says
      // "pending"). So we derive the effective status the same way the Members
      // page does, instead of counting members.membership_status directly.
      supabase.from("members").select("id, auth_user_id, membership_status")
        .eq("club_id", activeClub.club_id),
      supabase.from("club_memberships").select("id, user_id, status")
        .eq("club_id", activeClub.club_id),
      supabase.from("session_rsvps").select("session_id, status").eq("user_id", user.id),
      supabase.from("sessions")
        .select("id, session_type, survey_enabled, starts_at")
        .eq("club_id", activeClub.club_id)
        .or(`ends_at.gte.${nowIso},and(ends_at.is.null,starts_at.gte.${nowIso})`),
    ]);
    setUpcoming((sess.data ?? []) as Upcoming[]);
    setMemberCount(members.count ?? 0);

    // Effective status = club_memberships.status (matched by auth_user_id)
    // ?? members.membership_status ?? "approved" — identical to the Members page.
    const cmByUser = new Map((clubMems.data ?? []).map((m) => [m.user_id, m]));
    const representedUserIds = new Set<string>();
    let pendingCountNext = 0;
    for (const m of memberRows.data ?? []) {
      const cm = m.auth_user_id ? cmByUser.get(m.auth_user_id) : undefined;
      const status = cm?.status ?? m.membership_status ?? "approved";
      representedUserIds.add(m.auth_user_id ?? m.id);
      if (status === "pending") pendingCountNext++;
    }
    // Also count pending memberships that have no members row (Members page fallback).
    for (const cm of clubMems.data ?? []) {
      if (cm.status === "pending" && !representedUserIds.has(cm.user_id)) pendingCountNext++;
    }
    setPendingCount(pendingCountNext);
    const map: Record<string, string> = {};
    (rsvps.data ?? []).forEach((r) => { map[r.session_id] = r.status; });
    setMyRsvps(map);

    // Compute upcoming metrics — use same session scope as the sessions-page filters
    const list = (next7Sess.data ?? []) as { id: string; session_type: string; survey_enabled: boolean; starts_at: string }[];
    // Training count stays limited to next 7 days (matches "Next 7 days" section header)
    const trainingCount = list.filter((s) => s.session_type === "training" && s.starts_at <= in7Iso).length;
    // RSVP counter: all upcoming sessions where user has no row in session_rsvps
    const respondedIds = new Set(Object.keys(map));
    const rsvpsPending = list.filter((s) => !respondedIds.has(s.id)).length;
    // Surveys counter: all upcoming sessions with survey_enabled — mirrors the surveys-pending filter
    const surveysPending = list.filter((s) => s.survey_enabled).length;
    setNext7({ trainingCount, rsvpsPending, surveysPending });
    setLoaded(true);
  };

  useEffect(() => {
    if (!activeClub || !user) return;
    setUpcoming([]); setMemberCount(null); setPendingCount(null);
    setMyRsvps({}); setLoaded(false);
    setNext7({ trainingCount: 0, rsvpsPending: 0, surveysPending: 0 });
    refreshAll();
  }, [activeClub?.club_id, user?.id]);

  useRefetchOnFocus(refreshAll);

  if (!activeClub) return null;

  const nextSessionForWeather = upcoming.find((s) => s.location);

  return (
    <AppShell>
      <div className="mb-5">
        <p className="text-sm text-muted-foreground">{firstName ? `Welcome back, ${firstName}` : "Welcome back"}</p>
        <h1 className="text-2xl font-bold tracking-tight">{activeClub.club.name}</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Link to="/members">
          <Card className="p-4 bg-white border border-[#e5e7eb] border-l-4 border-l-primary shadow-none hover:border-accent hover:shadow-sm transition-all cursor-pointer">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
              <Users className="h-3.5 w-3.5 text-primary" /> Members
            </div>
            <div className="mt-1 text-3xl font-bold">{memberCount ?? "—"}</div>
          </Card>
        </Link>
        <Link to="/sessions">
          <Card className="p-4 bg-white border border-[#e5e7eb] border-l-4 border-l-primary shadow-none hover:border-accent hover:shadow-sm transition-all cursor-pointer">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
              <Calendar className="h-3.5 w-3.5 text-primary" /> Upcoming
            </div>
            <div className="mt-1 text-3xl font-bold">{loaded ? upcoming.length : "—"}</div>
          </Card>
        </Link>
      </div>

      {nextSessionForWeather && (
        <NextSessionCard session={nextSessionForWeather} />
      )}

      <div className="mb-6">
        <Card className="p-0 bg-white border border-[#e5e7eb] shadow-none overflow-hidden">
          <div className="px-4 py-3 border-b border-[#e5e7eb]">
            <h2 className="text-sm font-semibold">Actions needed</h2>
          </div>
          <div className="divide-y divide-[#e5e7eb]">
            <ActionRow
              icon={<ClipboardList className="h-4 w-4" />}
              label="Surveys to complete"
              count={next7.surveysPending}
              to="/sessions"
              search={{ filter: "surveys-pending" }}
            />
            <ActionRow
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="RSVPs to complete"
              count={next7.rsvpsPending}
              to="/sessions"
              search={{ filter: "rsvp-pending" }}
            />
            <ActionRow
              icon={<Dumbbell className="h-4 w-4" />}
              label="Upcoming training"
              count={next7.trainingCount}
              to="/sessions"
            />
          </div>
        </Card>
      </div>


      {isPlatformOwner && (
        <Card className="mb-3 p-3 border-primary/40 bg-primary/5">
          <Link to="/admin" className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-primary shrink-0" />
            <div className="flex-1">
              <div className="font-medium">Platform admin</div>
              <p className="text-xs text-muted-foreground">Stats across every club, manage owners, email coaches.</p>
            </div>
            <Button size="sm" variant="secondary">Open</Button>
          </Link>
        </Card>
      )}

      {isAdmin && pendingCount !== null && pendingCount > 0 && (
        <Card className="mb-5 p-4 rounded-xl border-l-4 border-l-warning border-warning/20 bg-warning/5">
          <div className="flex items-start gap-3">
            <UserPlus className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium">{pendingCount} member request{pendingCount === 1 ? "" : "s"} pending approval</div>
              <p className="text-sm text-muted-foreground">Review and approve new members to give them access</p>
            </div>
            <Button asChild size="sm" variant="secondary">
              <Link to="/members" search={{ tab: "pending" }}>Review now</Link>
            </Button>
          </div>
        </Card>
      )}


      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Upcoming sessions</h2>
        {canManage && (
          <Button asChild size="sm" variant="ghost" className="text-accent">
            <Link to="/sessions/new"><Plus className="h-4 w-4 mr-1" /> New</Link>
          </Button>
        )}
      </div>

      {!loaded ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1].map((i) => <Card key={i} className="p-4 h-20 animate-pulse bg-muted/30" />)}
        </div>
      ) : upcoming.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-5 w-5" />}
          title="No upcoming sessions"
          description="Schedule a training, race, or patrol so members can RSVP, sort carpools, and get the wave draw built ahead of time."
          action={canManage ? (
            <Button asChild>
              <Link to="/sessions/new"><Plus className="h-4 w-4 mr-1" /> Schedule a session</Link>
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-3">
          {upcoming.map((s) => (
            <Link key={s.id} to="/sessions/$sessionId" params={{ sessionId: s.id }}>
              <Card className="p-4 hover:border-accent transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-[10px] uppercase">{s.session_type}</Badge>
                      {myRsvps[s.id] === "going" && (
                        <Badge className="bg-success text-success-foreground text-[10px] uppercase">Going</Badge>
                      )}
                    </div>
                    <div className="font-semibold truncate">{s.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(s.starts_at), "EEE d MMM · h:mma")}
                      </span>
                      {s.location && (
                        <span className="flex items-center gap-1 truncate">
                          <MapPin className="h-3 w-3" /> {s.location}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function ActionRow({ icon, label, count, to, search }: {
  icon: React.ReactNode;
  label: string;
  count: number;
  to: string;
  search?: Record<string, string>;
}) {
  const active = count > 0;
  return (
    <Link
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      to={to as "/sessions"} search={search as any}
      className={cn(
        "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/10",
        !active && "opacity-50",
      )}
    >
      <div className={cn("shrink-0", active ? "text-primary" : "text-muted-foreground")}>{icon}</div>
      <div className="flex-1 min-w-0 text-sm font-medium">{label}</div>
      <Badge variant={active ? "default" : "secondary"}>{count}</Badge>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

function NextSessionCard({ session }: { session: Upcoming }) {
  const { weather, waves, tides } = useWeatherTidesData({
    sessionId: session.id,
    location: session.location,
    startsAt: session.starts_at,
  });

  return (
    <Card className="p-4 bg-white border border-[#e5e7eb] shadow-none mb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Next session</div>
          <div className="font-semibold truncate">{session.title}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {format(new Date(session.starts_at), "EEE d MMM · h:mma")}
          </div>
          {(weather || waves?.heightMax != null || (tides && tides.length > 0)) && (
            <div className="mt-2 flex items-center gap-3 text-sm flex-wrap">
              {weather && (
                <span className="flex items-center gap-1">
                  {weather.emoji} {weather.maxTemp}°C · {weather.windSpeed}km/h {weather.windDir}
                </span>
              )}
              {waves?.heightMax != null && (
                <span className="flex items-center gap-1">
                  🌊 {waves.heightMax.toFixed(1)}m{waves.periodMax != null ? ` · ${Math.round(waves.periodMax)}s` : ""}
                </span>
              )}
            </div>
          )}
          {tides && tides.length > 0 && (
            <div className="mt-1 flex flex-col gap-0.5 text-sm text-muted-foreground">
              {(["High", "Low"] as const).map((type) => {
                const entries = tides.filter((t) => t.type === type);
                if (entries.length === 0) return null;
                return (
                  <div key={type}>
                    🌊 {type === "High" ? "HT" : "LT"}:{" "}
                    {entries
                      .map((t) => `${t.time} · ${Math.round(t.height * 10) / 10}m`)
                      .join(",  ")}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <Button asChild size="sm" variant="outline" className="shrink-0">
          <Link to="/sessions/$sessionId" params={{ sessionId: session.id }}>View session</Link>
        </Button>
      </div>
    </Card>
  );
}
