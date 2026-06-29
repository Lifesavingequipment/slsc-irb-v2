import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { addDays, format } from "date-fns";
import {
  Sunrise,
  Sun,
  Moon,
  AlertTriangle,
  CheckCircle2,
  UserPlus,
  ClipboardCheck,
  Wrench,
  Users,
  Calendar,
  MapPin,
  CloudSun,
  ChevronRight,
  Plus,
  Megaphone,
  Share2,
  Dumbbell,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWeatherTidesData } from "@/components/session/WeatherTidesCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DashboardCard } from "@/components/dashboard/DashboardCard";

export type AdminSession = {
  id: string;
  title: string;
  starts_at: string;
  location: string | null;
  session_type: string;
  carpool_enabled?: boolean;
};

type RsvpSummary = Record<string, { going: number; total: number }>;

type AdminDashboardProps = {
  firstName: string | null;
  clubName: string;
  clubId: string;
  upcoming: AdminSession[];
  rsvpSummary: RsvpSummary;
  /** Active member count, computed by the route (mirrors the Members page). */
  memberCount: number | null;
  /** Pending member approvals, computed by the route (mirrors the Members page). */
  pendingCount: number | null;
  loaded: boolean;
};

type AdminStats = {
  openFaults: number;
  attendanceIncomplete: number;
  upcoming7d: number;
  /** Attendance % over the last 30 days, or null when there's no data. */
  attendancePct: number | null;
};

function greetingForNow(): { text: string; icon: typeof Sunrise } {
  const hour = new Date().getHours();
  if (hour < 12) return { text: "Good morning", icon: Sunrise };
  if (hour < 18) return { text: "Good afternoon", icon: Sun };
  return { text: "Good evening", icon: Moon };
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/**
 * Redesigned, mobile-first club-admin dashboard. Single column, card-based:
 * a time-of-day greeting, an "action required" triage section, today's
 * session, a club-overview stat grid, upcoming sessions and quick actions.
 *
 * All data comes from existing tables/queries — counts that mirror the Members
 * page (members, pending) are passed down from the route, while admin-only
 * metrics (faults, attendance) are fetched here.
 */
export function AdminDashboard({
  firstName,
  clubName,
  clubId,
  upcoming,
  rsvpSummary,
  memberCount,
  pendingCount,
  loaded,
}: AdminDashboardProps) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const greeting = greetingForNow();
  const GreetingIcon = greeting.icon;

  // Admin-only metrics: open gear faults, attendance completeness and a
  // 30-day attendance percentage, plus an accurate next-7-days session count.
  useEffect(() => {
    if (!clubId) return;
    let cancelled = false;
    setStats(null);
    (async () => {
      const now = new Date();
      const nowIso = now.toISOString();
      const in7Iso = addDays(now, 7).toISOString();
      const ago14Iso = addDays(now, -14).toISOString();

      const [faults, pastSessions, upcoming7d] = await Promise.all([
        supabase
          .from("equipment_faults")
          .select("id", { count: "exact", head: true })
          .eq("club_id", clubId)
          .eq("status", "open"),
        supabase
          .from("sessions")
          .select("id")
          .eq("club_id", clubId)
          .lte("starts_at", nowIso)
          .gte("starts_at", ago14Iso),
        supabase
          .from("sessions")
          .select("id", { count: "exact", head: true })
          .eq("club_id", clubId)
          .gte("starts_at", nowIso)
          .lte("starts_at", in7Iso),
      ]);

      const pastIds = (pastSessions.data ?? []).map((s) => s.id);
      let attendanceIncomplete = 0;
      let attendancePct: number | null = null;
      if (pastIds.length > 0) {
        const { data: attRows } = await supabase
          .from("session_attendance")
          .select("session_id, status")
          .in("session_id", pastIds);
        const rows = attRows ?? [];
        const markedSessions = new Set(rows.map((r) => r.session_id));
        attendanceIncomplete = pastIds.filter((id) => !markedSessions.has(id)).length;
        // Mirror the Attendance page: present marks / (sessions × members).
        if (memberCount && memberCount > 0) {
          const present = rows.filter((r) => r.status === "present").length;
          attendancePct = Math.round((present / (pastIds.length * memberCount)) * 100);
        }
      }

      if (cancelled) return;
      setStats({
        openFaults: faults.count ?? 0,
        attendanceIncomplete,
        upcoming7d: upcoming7d.count ?? 0,
        attendancePct,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [clubId, memberCount]);

  const todaySession = upcoming.find((s) => isToday(s.starts_at)) ?? null;

  const pending = pendingCount ?? 0;
  const incomplete = stats?.attendanceIncomplete ?? 0;
  const faults = stats?.openFaults ?? 0;
  const statsLoaded = stats !== null;
  // Only call it "all clear" once we actually know the counts.
  const nothingNeedsAttention =
    loaded && statsLoaded && pending === 0 && incomplete === 0 && faults === 0;

  return (
    <div className="space-y-4">
      {/* 1. Greeting + club name */}
      <DashboardCard
        icon={<GreetingIcon className="h-5 w-5" />}
        title={`${greeting.text}${firstName ? `, ${firstName}` : ""}`}
        supportingText={clubName}
      />

      {/* 2. Action required */}
      {nothingNeedsAttention ? (
        <DashboardCard className="border-success/30 bg-success/5">
          <div className="flex items-center gap-2 text-sm font-medium text-success">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            All clear — nothing needs attention.
          </div>
        </DashboardCard>
      ) : (
        (pending > 0 || incomplete > 0 || faults > 0) && (
          <DashboardCard
            icon={<AlertTriangle className="h-5 w-5" />}
            title="Action required"
            supportingText="Items that need an admin"
          >
            <div className="space-y-2">
              {pending > 0 && (
                <ActionRow
                  icon={<UserPlus className="h-4 w-4" />}
                  label={`${pending} member${pending === 1 ? "" : "s"} awaiting approval`}
                  cta="Review"
                  to="/members"
                  search={{ tab: "pending" }}
                />
              )}
              {incomplete > 0 && (
                <ActionRow
                  icon={<ClipboardCheck className="h-4 w-4" />}
                  label={`${incomplete} past session${incomplete === 1 ? "" : "s"} need attendance`}
                  cta="Mark"
                  to="/attendance"
                />
              )}
              {faults > 0 && (
                <ActionRow
                  icon={<Wrench className="h-4 w-4" />}
                  label={`${faults} open gear fault${faults === 1 ? "" : "s"}`}
                  cta="View"
                  to="/equipment/faults"
                />
              )}
            </div>
          </DashboardCard>
        )
      )}

      {/* 3. Today's session */}
      {todaySession && (
        <TodaySessionCard
          session={todaySession}
          going={rsvpSummary[todaySession.id]?.going ?? 0}
          noReply={Math.max((memberCount ?? 0) - (rsvpSummary[todaySession.id]?.total ?? 0), 0)}
        />
      )}

      {/* 4. Club overview */}
      <DashboardCard
        icon={<Users className="h-5 w-5" />}
        title="Club overview"
        supportingText="At a glance"
      >
        <div className="grid grid-cols-2 gap-2">
          <StatTile
            label="Active members"
            value={memberCount != null ? String(memberCount) : "—"}
            to="/members"
          />
          <StatTile
            label="Sessions · 7 days"
            value={statsLoaded ? String(stats.upcoming7d) : "—"}
            to="/sessions"
          />
          <StatTile
            label="Open faults"
            value={statsLoaded ? String(stats.openFaults) : "—"}
            to="/equipment/faults"
            tone={statsLoaded && stats.openFaults > 0 ? "warning" : undefined}
          />
          <StatTile
            label="Attendance · 30d"
            value={statsLoaded && stats.attendancePct != null ? `${stats.attendancePct}%` : "—"}
            to="/attendance"
          />
        </div>
      </DashboardCard>

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
          <QuickAction icon={<UserPlus className="h-5 w-5" />} label="Invite" to="/members" />
          <QuickAction icon={<Megaphone className="h-5 w-5" />} label="Announce" to="/chat" />
          <QuickAction icon={<Dumbbell className="h-5 w-5" />} label="Gear" to="/equipment" />
        </div>
      </DashboardCard>
    </div>
  );
}

function ActionRow({
  icon,
  label,
  cta,
  to,
  search,
}: {
  icon: React.ReactNode;
  label: string;
  cta: string;
  to: string;
  search?: { tab: string };
}) {
  return (
    <div className="flex min-h-11 items-center gap-3 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
      <Button asChild size="sm" variant="secondary" className="shrink-0">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Link to={to as any} search={search as any}>
          {cta}
        </Link>
      </Button>
    </div>
  );
}

function StatTile({
  label,
  value,
  to,
  tone,
}: {
  label: string;
  value: string;
  to: string;
  tone?: "warning";
}) {
  return (
    <Link
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      to={to as any}
      className="flex flex-col rounded-xl border border-[#e5e7eb] px-3 py-3 transition-colors hover:border-[#FF6600]"
    >
      <span
        className={cn(
          "text-2xl font-bold leading-none",
          tone === "warning" ? "text-warning" : "text-foreground",
        )}
      >
        {value}
      </span>
      <span className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </Link>
  );
}

function QuickAction({ icon, label, to }: { icon: React.ReactNode; label: string; to: string }) {
  return (
    <Button
      asChild
      variant="outline"
      className="flex h-auto min-h-11 flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-xs font-medium"
    >
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <Link to={to as any}>
        {icon}
        {label}
      </Link>
    </Button>
  );
}

function TodaySessionCard({
  session,
  going,
  noReply,
}: {
  session: AdminSession;
  going: number;
  noReply: number;
}) {
  const { weather, tides } = useWeatherTidesData({
    sessionId: session.id,
    startsAt: session.starts_at,
  });

  const summary = weather
    ? `${weather.emoji} ${weather.maxTemp}°C · ${weather.windSpeed}km/h ${weather.windDir}`
    : null;
  const high = tides?.find((t) => t.type === "High")?.time ?? null;

  const share = async () => {
    const text = `${session.title} — ${format(new Date(session.starts_at), "EEE d MMM · h:mma")}${
      session.location ? ` @ ${session.location.split(" — ")[0]}` : ""
    }`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: session.title, text });
      } catch {
        /* cancelled */
      }
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }
  };

  return (
    <DashboardCard
      icon={<Calendar className="h-5 w-5" />}
      title="Today's session"
      supportingText={session.title}
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
        {(summary || high) && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <CloudSun className="h-4 w-4 shrink-0" />
            <span>
              {summary}
              {summary && high ? " · " : ""}
              {high ? `High tide ${high}` : ""}
            </span>
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          to="/sessions/$sessionId"
          params={{ sessionId: session.id }}
          search={{ tab: "rsvp" }}
          className="flex flex-col items-center rounded-xl border border-[#e5e7eb] py-2.5 transition-colors hover:border-[#FF6600]"
        >
          <span className="text-xl font-bold leading-none text-success">{going}</span>
          <span className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            Going
          </span>
        </Link>
        <Link
          to="/sessions/$sessionId"
          params={{ sessionId: session.id }}
          search={{ tab: "rsvp" }}
          className="flex flex-col items-center rounded-xl border border-[#e5e7eb] py-2.5 transition-colors hover:border-[#FF6600]"
        >
          <span className="text-xl font-bold leading-none text-foreground">{noReply}</span>
          <span className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            No reply
          </span>
        </Link>
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
        <Button size="sm" variant="outline" className="min-h-11" onClick={share}>
          <Share2 className="h-4 w-4" />
          Share
        </Button>
      </div>
    </DashboardCard>
  );
}
