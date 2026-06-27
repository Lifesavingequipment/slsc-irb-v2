import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  Sunrise,
  ListChecks,
  Users,
  Calendar,
  MapPin,
  ClipboardCheck,
  ClipboardList,
  MessageSquare,
  Plus,
  Waves as WavesIcon,
  CheckCircle2,
  ChevronRight,
  CloudSun,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWeatherTidesData } from "@/components/session/WeatherTidesCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DashboardCard } from "@/components/dashboard/DashboardCard";

export type CoachSession = {
  id: string;
  title: string;
  starts_at: string;
  location: string | null;
  session_type: string;
  carpool_enabled?: boolean;
};

type MorningBrief = {
  next_session: { id: string; name: string; starts_at: string; location: string | null } | null;
  rsvp_counts: { going: number; maybe: number; no_response: number; unavailable: number };
  members_needing_transport: number;
  attendance_started: boolean;
  weather: { summary: string } | null;
  tide: { next_high_time: string } | null;
};

type Checklist = {
  plan: boolean;
  waves: boolean;
  gear: boolean;
  attendance: boolean;
  carpool: boolean;
};

type CoachDashboardProps = {
  firstName: string | null;
  clubName: string;
  clubId: string;
  upcoming: CoachSession[];
  loaded: boolean;
};

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** Human "starts in …" for a session within the next day, else null. */
function startsInLabel(iso: string): string | null {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0 || diffMs > 24 * 60 * 60 * 1000) return null;
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `Training starts in ${mins} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.round(mins / 60);
  return `Training starts in ${hours} hour${hours === 1 ? "" : "s"}`;
}

/**
 * Redesigned, mobile-first coach dashboard. Single column, card-based: a
 * single-RPC morning brief, an inline training checklist, team status, today's
 * session, upcoming sessions and quick actions.
 */
export function CoachDashboard({
  firstName,
  clubName,
  clubId,
  upcoming,
  loaded,
}: CoachDashboardProps) {
  const [brief, setBrief] = useState<MorningBrief | null>(null);
  const [briefLoaded, setBriefLoaded] = useState(false);
  const [checklist, setChecklist] = useState<Checklist | null>(null);

  // Morning brief — a SINGLE Supabase RPC for the whole section.
  useEffect(() => {
    if (!clubId) return;
    let cancelled = false;
    setBrief(null);
    setBriefLoaded(false);
    (async () => {
      const { data, error } = await supabase.rpc("get_coach_morning_brief", {
        p_club_id: clubId,
      });
      if (cancelled) return;
      if (!error && data) setBrief(data as unknown as MorningBrief);
      setBriefLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  // Training checklist completion — derived from existing per-session data.
  const nextSession = brief?.next_session ?? null;
  const nextSessionId = nextSession?.id ?? null;
  const carpoolEnabled = upcoming.find((s) => s.id === nextSessionId)?.carpool_enabled ?? false;

  useEffect(() => {
    if (!nextSessionId) {
      setChecklist(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const [plan, waves, gear, carpool] = await Promise.all([
        supabase
          .from("session_training_plans")
          .select("id")
          .eq("session_id", nextSessionId)
          .maybeSingle(),
        supabase
          .from("session_teams")
          .select("id", { count: "exact", head: true })
          .eq("session_id", nextSessionId),
        supabase
          .from("session_equipment")
          .select("id", { count: "exact", head: true })
          .eq("session_id", nextSessionId),
        supabase
          .from("carpool_requests")
          .select("id", { count: "exact", head: true })
          .eq("session_id", nextSessionId),
      ]);
      if (cancelled) return;
      setChecklist({
        plan: !!plan.data,
        waves: (waves.count ?? 0) > 0,
        gear: (gear.count ?? 0) > 0,
        attendance: brief?.attendance_started ?? false,
        // No carpool needed counts as done; otherwise needs at least one request.
        carpool: !carpoolEnabled || (carpool.count ?? 0) > 0,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [nextSessionId, carpoolEnabled, brief?.attendance_started]);

  // Morning brief bullets — only relevant, non-zero items.
  const briefItems: string[] = [];
  if (brief) {
    const today = nextSession ? isToday(nextSession.starts_at) : false;
    if (brief.rsvp_counts.no_response > 0)
      briefItems.push(`${brief.rsvp_counts.no_response} members still to RSVP`);
    if (nextSession) {
      const starts = startsInLabel(nextSession.starts_at);
      if (starts) briefItems.push(starts);
    }
    if (brief.members_needing_transport > 0)
      briefItems.push(`${brief.members_needing_transport} members need transport`);
    if (today && !brief.attendance_started) briefItems.push("Attendance not started");
  }

  return (
    <div className="space-y-4">
      {/* 1. Morning brief */}
      <DashboardCard
        icon={<Sunrise className="h-5 w-5" />}
        title={`Good morning${firstName ? `, ${firstName}` : ""}`}
        supportingText={clubName}
      >
        {!briefLoaded ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1].map((i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-muted/30" />
            ))}
          </div>
        ) : !nextSession ? (
          <p className="text-sm text-muted-foreground">No upcoming sessions to brief on.</p>
        ) : briefItems.length === 0 ? (
          <p className="text-sm font-medium text-success">
            Everything is ready for today's training.
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {briefItems.map((item) => (
              <li key={item} className="flex items-start gap-2 text-muted-foreground">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF6600]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
      </DashboardCard>

      {/* 2. Training checklist */}
      <DashboardCard
        icon={<ListChecks className="h-5 w-5" />}
        title="Training checklist"
        supportingText={nextSession ? nextSession.name : "Get the next session ready"}
      >
        {!nextSessionId ? (
          <p className="text-sm text-muted-foreground">No session to prepare yet.</p>
        ) : (
          <div className="space-y-2">
            <ChecklistRow
              label="Training Plan"
              done={checklist?.plan ?? false}
              to="/sessions/$sessionId"
              params={{ sessionId: nextSessionId }}
              search={{ tab: "plan" }}
            />
            <ChecklistRow
              label="Waves"
              done={checklist?.waves ?? false}
              to="/sessions/$sessionId"
              params={{ sessionId: nextSessionId }}
              search={{ tab: "waves" }}
            />
            <ChecklistRow
              label="Gear"
              done={checklist?.gear ?? false}
              to="/sessions/$sessionId"
              params={{ sessionId: nextSessionId }}
              search={{ tab: "gear" }}
            />
            <ChecklistRow
              label="Attendance"
              done={checklist?.attendance ?? false}
              to="/sessions/$sessionId"
              params={{ sessionId: nextSessionId }}
              search={{ tab: "attendance" }}
            />
            <ChecklistRow
              label="Carpool"
              done={checklist?.carpool ?? false}
              to="/sessions/$sessionId/carpool"
              params={{ sessionId: nextSessionId }}
            />
          </div>
        )}
      </DashboardCard>

      {/* 3. Team status */}
      <DashboardCard
        icon={<Users className="h-5 w-5" />}
        title="Team status"
        supportingText={nextSession ? "Tap to open the RSVP list" : "No session yet"}
      >
        <div className="grid grid-cols-4 gap-2">
          <TeamStat
            label="Going"
            value={brief?.rsvp_counts.going ?? 0}
            tone="success"
            sessionId={nextSessionId}
          />
          <TeamStat
            label="Maybe"
            value={brief?.rsvp_counts.maybe ?? 0}
            tone="warning"
            sessionId={nextSessionId}
          />
          <TeamStat
            label="No reply"
            value={brief?.rsvp_counts.no_response ?? 0}
            tone="muted"
            sessionId={nextSessionId}
          />
          <TeamStat
            label="Unavail."
            value={brief?.rsvp_counts.unavailable ?? 0}
            tone="muted"
            sessionId={nextSessionId}
          />
        </div>
      </DashboardCard>

      {/* 4. Today's session */}
      {briefLoaded && nextSession && (
        <TodaySessionCard
          session={nextSession}
          weatherSummary={brief?.weather?.summary ?? null}
          tideHigh={brief?.tide?.next_high_time ?? null}
        />
      )}

      {/* 5. Upcoming sessions */}
      <DashboardCard
        icon={<Calendar className="h-5 w-5" />}
        title="Upcoming sessions"
        supportingText="What's coming up at your club"
      >
        {!loaded ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/30" />
            ))}
          </div>
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sessions scheduled yet</p>
        ) : (
          <div className="space-y-2">
            {upcoming.slice(0, 3).map((s) => (
              <Link
                key={s.id}
                to="/sessions/$sessionId"
                params={{ sessionId: s.id }}
                className="flex min-h-11 items-center gap-3 rounded-xl border border-[#e5e7eb] px-3 py-2.5 transition-colors hover:border-[#FF6600]"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{s.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {format(new Date(s.starts_at), "EEE d MMM · h:mma")}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
            <Link to="/sessions" className="block pt-1 text-sm font-medium text-[#FF6600]">
              View all →
            </Link>
          </div>
        )}
      </DashboardCard>

      {/* 6. Quick actions */}
      <DashboardCard>
        <div className="grid grid-cols-4 gap-2">
          <QuickAction icon={<Plus className="h-5 w-5" />} label="Create" to="/sessions/new" />
          <QuickAction icon={<MessageSquare className="h-5 w-5" />} label="Message" to="/chat" />
          <QuickAction
            icon={<ClipboardList className="h-5 w-5" />}
            label="Plan"
            to={nextSessionId ? "/sessions/$sessionId" : "/sessions"}
            params={nextSessionId ? { sessionId: nextSessionId } : undefined}
            search={nextSessionId ? { tab: "plan" } : undefined}
          />
          <QuickAction
            icon={<WavesIcon className="h-5 w-5" />}
            label="Waves"
            to={nextSessionId ? "/sessions/$sessionId" : "/sessions"}
            params={nextSessionId ? { sessionId: nextSessionId } : undefined}
            search={nextSessionId ? { tab: "waves" } : undefined}
          />
        </div>
      </DashboardCard>
    </div>
  );
}

function ChecklistRow({
  label,
  done,
  to,
  params,
  search,
}: {
  label: string;
  done: boolean;
  to: string;
  params: { sessionId: string };
  search?: { tab: string };
}) {
  return (
    <Link
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      to={to as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      params={params as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      search={search as any}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
        done ? "border-success/40 bg-success/5" : "border-[#e5e7eb] hover:border-[#FF6600]",
      )}
    >
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
          done ? "border-success bg-success text-success-foreground" : "border-muted-foreground/40",
        )}
      >
        {done && <CheckCircle2 className="h-4 w-4" />}
      </span>
      <span className={cn("flex-1 text-sm font-medium transition-colors", done && "text-success")}>
        {label}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function TeamStat({
  label,
  value,
  tone,
  sessionId,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "muted";
  sessionId: string | null;
}) {
  const toneClass =
    tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";
  const inner = (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border border-[#e5e7eb] py-3 transition-colors",
        sessionId && "hover:border-[#FF6600]",
      )}
    >
      <span className={cn("text-2xl font-bold leading-none", toneClass)}>{value}</span>
      <span className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
  if (!sessionId) return inner;
  return (
    <Link to="/sessions/$sessionId" params={{ sessionId }} search={{ tab: "rsvp" }}>
      {inner}
    </Link>
  );
}

function QuickAction({
  icon,
  label,
  to,
  params,
  search,
}: {
  icon: React.ReactNode;
  label: string;
  to: string;
  params?: { sessionId: string };
  search?: { tab: string };
}) {
  return (
    <Button
      asChild
      variant="outline"
      className="flex h-auto min-h-11 flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-xs font-medium"
    >
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <Link to={to as any} params={params as any} search={search as any}>
        {icon}
        {label}
      </Link>
    </Button>
  );
}

function TodaySessionCard({
  session,
  weatherSummary,
  tideHigh,
}: {
  session: { id: string; name: string; starts_at: string; location: string | null };
  weatherSummary: string | null;
  tideHigh: string | null;
}) {
  // Fall back to live weather/tide if the brief cache was empty.
  const { weather, tides } = useWeatherTidesData({
    sessionId: session.id,
    startsAt: session.starts_at,
  });

  const summary =
    weatherSummary ??
    (weather
      ? `${weather.emoji} ${weather.maxTemp}°C · ${weather.windSpeed}km/h ${weather.windDir}`
      : null);
  const high = tideHigh ?? tides?.find((t) => t.type === "High")?.time ?? null;

  return (
    <DashboardCard
      icon={<Calendar className="h-5 w-5" />}
      title="Today's session"
      supportingText={session.name}
    >
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Calendar className="h-4 w-4 shrink-0" />
          {format(new Date(session.starts_at), "EEE d MMM · h:mma")}
        </div>
        {session.location && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0" />
            {session.location.split(" — ")[0]}
          </div>
        )}
        {summary && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <CloudSun className="h-4 w-4 shrink-0" />
            <span>
              {summary}
              {high ? ` · High tide ${high}` : ""}
            </span>
          </div>
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button asChild size="sm" variant="default" className="min-h-11">
          <Link to="/sessions/$sessionId" params={{ sessionId: session.id }}>
            Manage
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="min-h-11">
          <Link
            to="/sessions/$sessionId"
            params={{ sessionId: session.id }}
            search={{ tab: "attendance" }}
          >
            <ClipboardCheck className="h-4 w-4" />
            Attend
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="min-h-11">
          <Link to="/chat">
            <MessageSquare className="h-4 w-4" />
            Message
          </Link>
        </Button>
      </div>
    </DashboardCard>
  );
}
