import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { addDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useClub, useCanManage, useIsAdmin, useIsGuardian } from "@/lib/club-context";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Plus, Users, UserPlus, Shield, ClipboardList, ClipboardCheck, CheckCircle2, Dumbbell, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useIsPlatformOwner } from "@/lib/platform-owner";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";
import { useMemberFirstName } from "@/hooks/useMemberFirstName";
import { useWeatherTidesData, useLocationWeatherData } from "@/components/session/WeatherTidesCard";
import { cn } from "@/lib/utils";
import { PushPromptBanner } from "@/components/PushPromptBanner";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — IRB Coaching" }] }),
  component: Dashboard,
});

type Upcoming = {
  id: string; title: string; starts_at: string; location: string | null; session_type: string;
};

type RsvpSummary = Record<string, { going: number; total: number }>;

function Dashboard() {
  const { user } = useAuth();
  const { activeClub } = useClub();
  const canManage = useCanManage();
  const isPlatformOwner = useIsPlatformOwner();
  const isGuardian = useIsGuardian();
  const firstName = useMemberFirstName();

  const [upcoming, setUpcoming] = useState<Upcoming[]>([]);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [myRsvps, setMyRsvps] = useState<Record<string, string>>({});
  const [rsvpSummary, setRsvpSummary] = useState<RsvpSummary>({});
  const [loaded, setLoaded] = useState(false);
  const [guardianChildren, setGuardianChildren] = useState<{ id: string; name: string }[]>([]);
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
    const [sess, memberRows, clubMems, rsvps, next7Sess] = await Promise.all([
      supabase.from("sessions")
        .select("id, title, starts_at, location, session_type, ends_at")
        .eq("club_id", activeClub.club_id)
        .or(`ends_at.gte.${nowIso},and(ends_at.is.null,starts_at.gte.${nowIso})`)
        .order("starts_at", { ascending: true })
        .limit(5),
      // Member/pending counts must mirror the Members page exactly. The
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
    const uniqueSessions = Array.from(new Map((sess.data ?? []).map((s) => [s.id, s])).values());
    setUpcoming(uniqueSessions as Upcoming[]);

    // RSVP summary (going/maybe/not_going counts) for the upcoming sessions shown on the dashboard.
    const upcomingIds = (sess.data ?? []).map((s) => s.id);
    const rsvpSummaryRes = upcomingIds.length
      ? await supabase.from("session_rsvps").select("session_id, status").in("session_id", upcomingIds)
      : { data: [] as { session_id: string; status: string }[] };
    const summary: RsvpSummary = {};
    for (const r of rsvpSummaryRes.data ?? []) {
      if (!summary[r.session_id]) summary[r.session_id] = { going: 0, total: 0 };
      summary[r.session_id].total++;
      if (r.status === "going") summary[r.session_id].going++;
    }
    setRsvpSummary(summary);

    // Effective status = club_memberships.status (matched by auth_user_id)
    // ?? members.membership_status ?? "approved" — identical to the Members page.
    const cmByUser = new Map((clubMems.data ?? []).map((m) => [m.user_id, m]));
    const representedUserIds = new Set<string>();
    let pendingCountNext = 0;
    let activeCountNext = 0;
    for (const m of memberRows.data ?? []) {
      const cm = m.auth_user_id ? cmByUser.get(m.auth_user_id) : undefined;
      const status = cm?.status ?? m.membership_status ?? "approved";
      representedUserIds.add(m.auth_user_id ?? m.id);
      if (status === "pending") pendingCountNext++;
      if (status === "approved" || status === "active") activeCountNext++;
    }
    // Also count pending memberships that have no members row (Members page fallback).
    for (const cm of clubMems.data ?? []) {
      if (cm.status === "pending" && !representedUserIds.has(cm.user_id)) pendingCountNext++;
    }
    setPendingCount(pendingCountNext);
    setMemberCount(activeCountNext);
    const map: Record<string, string> = {};
    (rsvps.data ?? []).forEach((r) => { map[r.session_id] = r.status; });
    setMyRsvps(map);

    // Compute upcoming metrics — use same session scope as the sessions-page filters
    const list = (next7Sess.data ?? []) as { id: string; session_type: string; survey_enabled: boolean; starts_at: string }[];
    // Training count stays limited to next 7 days (matches "Next 7 days" section header)
    const trainingCount = list.filter((s) => s.session_type === "training" && s.starts_at <= in7Iso).length;
    // RSVP counter: upcoming sessions within the next 7 days where user has no row in session_rsvps
    const respondedIds = new Set(Object.keys(map));
    const rsvpsPending = list.filter((s) => !respondedIds.has(s.id) && s.starts_at <= in7Iso).length;
    // Surveys counter: all upcoming sessions with survey_enabled — mirrors the surveys-pending filter
    const surveysPending = list.filter((s) => s.survey_enabled).length;
    setNext7({ trainingCount, rsvpsPending, surveysPending });

    if (isGuardian) {
      const { data: me } = await supabase
        .from("members")
        .select("id")
        .eq("auth_user_id", user.id)
        .eq("club_id", activeClub.club_id)
        .maybeSingle();
      const myMemberId = me?.id;
      if (myMemberId) {
        const { data: links } = await supabase
          .from("member_guardians")
          .select("child_member_id, child:members(first_name, last_name, preferred_name)")
          .eq("guardian_user_id", user.id)
          .eq("club_id", activeClub.club_id);
        setGuardianChildren((links ?? []).map((l) => {
          const c = l.child as { first_name?: string; last_name?: string; preferred_name?: string };
          return { id: l.child_member_id, name: c.preferred_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "Child" };
        }));
      }
    }

    setLoaded(true);
  };

  useEffect(() => {
    if (!activeClub || !user) return;
    setUpcoming([]); setMemberCount(null); setPendingCount(null);
    setMyRsvps({}); setRsvpSummary({}); setLoaded(false);
    setNext7({ trainingCount: 0, rsvpsPending: 0, surveysPending: 0 });
    setGuardianChildren([]);
    refreshAll();
  }, [activeClub?.club_id, user?.id]);

  useRefetchOnFocus(refreshAll);

  if (!activeClub) return null;

  const nextSessionForWeather = upcoming.find((s) => s.location);
  const nextSession = upcoming[0];

  let subtitle: string | null = null;
  if (canManage) {
    if (nextSession) {
      const respondedCount = rsvpSummary[nextSession.id]?.total ?? 0;
      subtitle = `Next: ${nextSession.title} · ${respondedCount} of ${memberCount ?? 0} members responded`;
    }
  } else {
    const { rsvpsPending, surveysPending } = next7;
    if (rsvpsPending > 0 && surveysPending > 0) {
      subtitle = `You have ${rsvpsPending} RSVPs and ${surveysPending} surveys to complete`;
    } else if (rsvpsPending > 0) {
      subtitle = `You have ${rsvpsPending} RSVPs to complete`;
    } else if (surveysPending > 0) {
      subtitle = `You have ${surveysPending} surveys to complete`;
    } else {
      subtitle = "You're all caught up ✓";
    }
  }

  const totalResponded = Object.values(rsvpSummary).reduce((acc, v) => acc + v.total, 0);
  const totalExpected = memberCount && upcoming.length ? memberCount * upcoming.length : null;

  type QuickAction = { label: string; to: string; search?: Record<string, string>; icon: React.ReactNode };
  const quickActions: QuickAction[] = canManage
    ? [
        { label: "Create Session", to: "/sessions/new", icon: <Plus className="h-4 w-4" /> },
        { label: "Record Attendance", to: "/attendance", icon: <ClipboardCheck className="h-4 w-4" /> },
        { label: "View Members", to: "/members", icon: <Users className="h-4 w-4" /> },
        { label: "View Sessions", to: "/sessions", icon: <Calendar className="h-4 w-4" /> },
        ...(isPlatformOwner ? [{ label: "Manage Clubs", to: "/owner", icon: <Shield className="h-4 w-4" /> }] : []),
      ]
    : [
        { label: "RSVP Now", to: "/sessions", search: { filter: "rsvp-pending" }, icon: <CheckCircle2 className="h-4 w-4" /> },
        { label: "View Sessions", to: "/sessions", icon: <Calendar className="h-4 w-4" /> },
        { label: "View Training", to: "/sessions", icon: <Dumbbell className="h-4 w-4" /> },
      ];

  const upcomingPreview = upcoming.slice(0, 3);

  return (
    <AppShell>
      <div className="mb-5">
        <p className="text-sm text-muted-foreground">{firstName ? `Welcome back, ${firstName}` : "Welcome back"}</p>
        <h1 className="text-2xl font-bold tracking-tight">{activeClub.club.name}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>

      <PushPromptBanner />
      <TodayConditionsCard />

      {isGuardian && guardianChildren.length > 0 && (
        <Card className="p-4 rounded-xl mb-4 bg-[#FF6600]/5 border-[#FF6600]/20">
          <p className="text-sm text-muted-foreground">Viewing as guardian of</p>
          <p className="font-semibold">{guardianChildren.map((c) => c.name).join(", ")}</p>
        </Card>
      )}

      {canManage && pendingCount !== null && pendingCount > 0 && (
        <Card className="mb-4 p-4 rounded-xl border-l-4 border-l-warning border-warning/20 bg-warning/5">
          <div className="flex items-start gap-3">
            <UserPlus className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium">{pendingCount} member request{pendingCount === 1 ? "" : "s"} awaiting approval</div>
              <p className="text-sm text-muted-foreground">Review and approve new members to give them access</p>
            </div>
            <Button asChild size="sm" variant="secondary">
              <Link to="/members" search={{ tab: "pending" }}>Review</Link>
            </Button>
          </div>
        </Card>
      )}

      <div className="mb-6">
        <Card className="p-0 bg-white border border-[#e5e7eb] rounded-xl shadow-none overflow-hidden">
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

      {!loaded ? (
        <div className={cn("grid gap-3 mb-4", canManage ? "grid-cols-2" : "grid-cols-2")} aria-busy="true">
          {(canManage ? [0, 1, 2, 3] : [0, 1]).map((i) => (
            <Card key={i} className="h-16 rounded-xl animate-pulse bg-muted/30" />
          ))}
        </div>
      ) : canManage ? (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Link to="/members">
            <Card className="p-4 rounded-xl bg-white border border-[#e5e7eb] border-l-4 border-l-primary shadow-none hover:border-accent hover:shadow-sm transition-all cursor-pointer">
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
                <Users className="h-3.5 w-3.5 text-primary" /> Members
              </div>
              <div className="mt-1 text-3xl font-bold">{memberCount ?? "—"}</div>
            </Card>
          </Link>
          <Link to="/sessions">
            <Card className="p-4 rounded-xl bg-white border border-[#e5e7eb] border-l-4 border-l-primary shadow-none hover:border-accent hover:shadow-sm transition-all cursor-pointer">
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
                <Calendar className="h-3.5 w-3.5 text-primary" /> Sessions
              </div>
              <div className="mt-1 text-3xl font-bold">{upcoming.length}</div>
            </Card>
          </Link>
          <Card className="p-4 rounded-xl bg-white border border-[#e5e7eb] border-l-4 border-l-primary shadow-none">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> RSVPs
            </div>
            <div className="mt-1 text-2xl font-bold leading-none">
              {totalExpected !== null ? `${totalResponded} / ${totalExpected}` : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">responded</div>
          </Card>
          <Link to="/sessions" search={{ filter: "surveys-pending" }}>
            <Card className="p-4 rounded-xl bg-white border border-[#e5e7eb] border-l-4 border-l-primary shadow-none hover:border-accent hover:shadow-sm transition-all cursor-pointer">
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
                <ClipboardList className="h-3.5 w-3.5 text-primary" /> Surveys
              </div>
              <div className="mt-1 text-3xl font-bold">{next7.surveysPending}</div>
            </Card>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Link to="/sessions">
            <Card className="p-4 rounded-xl bg-white border border-[#e5e7eb] border-l-4 border-l-primary shadow-none hover:border-accent hover:shadow-sm transition-all cursor-pointer">
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
                <Calendar className="h-3.5 w-3.5 text-primary" /> Sessions
              </div>
              <div className="mt-1 text-3xl font-bold">{upcoming.length}</div>
            </Card>
          </Link>
          <Card className="p-4 rounded-xl bg-white border border-[#e5e7eb] border-l-4 border-l-primary shadow-none">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
              <Dumbbell className="h-3.5 w-3.5 text-primary" /> Training
            </div>
            <div className="mt-1 text-3xl font-bold">{next7.trainingCount}</div>
          </Card>
        </div>
      )}

      {nextSessionForWeather && (
        <NextSessionCard
          session={nextSessionForWeather}
          myRsvp={myRsvps[nextSessionForWeather.id] ?? null}
          canManage={canManage}
        />
      )}

      <div className="mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Quick actions</h2>
        {quickActions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No quick actions available</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((a) => (
              <Button
                key={a.label}
                asChild
                variant="outline"
                className="h-14 min-h-11 rounded-xl justify-start gap-2 px-4 text-sm font-medium"
              >
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Link to={a.to as "/sessions"} search={a.search as any}>
                  {a.icon}
                  {a.label}
                </Link>
              </Button>
            ))}
          </div>
        )}
      </div>

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
          {[0, 1].map((i) => <Card key={i} className="p-4 h-20 rounded-xl animate-pulse bg-muted/30" />)}
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
          {upcomingPreview.map((s) => (
            <Link key={s.id} to="/sessions/$sessionId" params={{ sessionId: s.id }}>
              <Card className="p-4 rounded-xl hover:border-accent transition-colors">
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
                          <MapPin className="h-3 w-3" /> {s.location.split(" — ")[0]}
                        </span>
                      )}
                    </div>
                    {rsvpSummary[s.id] && rsvpSummary[s.id].total > 0 && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {rsvpSummary[s.id].going} going · {rsvpSummary[s.id].total} responded
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
          <Link to="/sessions" className="block text-sm text-accent">View all sessions →</Link>
        </div>
      )}

      {isPlatformOwner && (
        <Card className="mt-4 mb-3 p-3 rounded-xl border-primary/40 bg-primary/5">
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

type DefaultLoc = { id: string; name: string; address: string | null };

function TodayConditionsCard() {
  const { activeClub } = useClub();
  const isAdmin = useIsAdmin();
  const [defaultLoc, setDefaultLoc] = useState<DefaultLoc | null | undefined>(undefined);

  useEffect(() => {
    if (!activeClub) return;
    setDefaultLoc(undefined);
    supabase
      .from("locations")
      .select("id, name, address")
      .eq("club_id", activeClub.club_id)
      .eq("is_default", true)
      .maybeSingle()
      .then(({ data }) => setDefaultLoc((data as DefaultLoc) ?? null));
  }, [activeClub?.club_id]);

  if (!activeClub || defaultLoc === undefined) return null;

  if (!defaultLoc) {
    if (!isAdmin) return null;
    return (
      <Card className="p-3 mb-4 bg-white border border-[#e5e7eb] shadow-none">
        <p className="text-xs text-muted-foreground">
          Set a home beach in{" "}
          <Link to="/settings" search={{ section: "locations" }} className="text-accent underline">Settings → Saved locations</Link>
          {" "}to see today's conditions.
        </p>
      </Card>
    );
  }

  return <TodayConditionsCardContent location={defaultLoc} />;
}

function TodayConditionsCardContent({ location }: { location: DefaultLoc }) {
  const { loading, weather, waves, tides } = useLocationWeatherData({ locationId: location.id });

  const hasData = !!weather || waves?.heightMax != null || !!(tides && tides.length > 0);

  if (!hasData) {
    return (
      <Card className="p-4 bg-white border border-[#e5e7eb] shadow-none mb-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
          Today at {location.name}
        </div>
        <p className="text-sm text-muted-foreground">
          {loading ? "Loading conditions…" : "Conditions are still loading — check back shortly."}
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4 bg-white border border-[#e5e7eb] shadow-none mb-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
        Today at {location.name}
      </div>
      <div className="flex items-center gap-3 text-sm flex-wrap">
        {weather && (
          <span className="flex items-center gap-1">
            {weather.emoji} {weather.maxTemp}°C · {weather.windSpeed}km/h {weather.windDir}
            {weather.uvIndex != null ? ` · UV ${weather.uvIndex}` : ""}
          </span>
        )}
        {waves?.heightMax != null && (
          <span className="flex items-center gap-1">
            🌊 {waves.heightMax.toFixed(1)}m{waves.periodMax != null ? ` · ${Math.round(waves.periodMax)}s` : ""}
          </span>
        )}
      </div>
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
    </Card>
  );
}

function NextSessionCard({ session, myRsvp, canManage }: {
  session: Upcoming;
  myRsvp?: string | null;
  canManage: boolean;
}) {
  const { weather, waves, tides } = useWeatherTidesData({
    sessionId: session.id,
    startsAt: session.starts_at,
  });

  return (
    <Card className="p-4 rounded-xl bg-white border border-[#e5e7eb] shadow-none mb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Next session</div>
          <div className="font-semibold truncate">{session.title}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {format(new Date(session.starts_at), "EEE d MMM · h:mma")}
          </div>
          {myRsvp && (
            <div className="mt-1.5">
              {myRsvp === "going" && (
                <Badge className="bg-success text-success-foreground text-[10px] uppercase">Going</Badge>
              )}
              {myRsvp === "maybe" && (
                <Badge className="bg-warning text-warning-foreground text-[10px] uppercase">Maybe</Badge>
              )}
              {myRsvp === "not_going" && (
                <Badge variant="secondary" className="text-[10px] uppercase">Can't go</Badge>
              )}
            </div>
          )}
          {(weather || waves?.heightMax != null || (tides && tides.length > 0)) && (
            <div className="mt-2 flex items-center gap-3 text-sm flex-wrap">
              {weather && (
                <span className="flex items-center gap-1">
                  {weather.emoji} {weather.maxTemp}°C · {weather.windSpeed}km/h {weather.windDir}
                  {weather.uvIndex != null ? ` · UV ${weather.uvIndex}` : ""}
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
        <div className="shrink-0 flex items-center gap-2">
          {!myRsvp && !canManage ? (
            <Button asChild size="sm" className="min-h-11">
              <Link to="/sessions/$sessionId" params={{ sessionId: session.id }}>RSVP Now</Link>
            </Button>
          ) : canManage ? (
            <>
              <Button asChild size="sm" variant="outline" className="min-h-11">
                <Link to="/sessions/$sessionId" params={{ sessionId: session.id }}>View</Link>
              </Button>
              <Button asChild size="sm" variant="ghost" className="min-h-11">
                <Link to="/sessions/$sessionId/edit" params={{ sessionId: session.id }}>Edit</Link>
              </Button>
            </>
          ) : (
            <Button asChild size="sm" variant="outline" className="min-h-11">
              <Link to="/sessions/$sessionId" params={{ sessionId: session.id }}>View session</Link>
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
