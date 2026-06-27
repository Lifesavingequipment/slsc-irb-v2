import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  Calendar,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Car,
  Megaphone,
  MapPin,
  Activity,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useClub } from "@/lib/club-context";
import { useNotifications } from "@/hooks/useNotifications";
import { useWeatherTidesData } from "@/components/session/WeatherTidesCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardCard } from "@/components/dashboard/DashboardCard";

export type MemberSession = {
  id: string;
  title: string;
  starts_at: string;
  location: string | null;
  session_type: string;
  carpool_enabled?: boolean;
};

type MemberDashboardProps = {
  firstName: string | null;
  clubName: string;
  upcoming: MemberSession[];
  myRsvps: Record<string, string>;
  loaded: boolean;
};

function greetingForNow(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** RSVP status → badge styling, mirroring the shared dashboard convention. */
function RsvpBadge({ status }: { status: string | null | undefined }) {
  if (status === "going")
    return <Badge className="bg-success text-success-foreground text-[10px] uppercase">Going</Badge>;
  if (status === "maybe")
    return <Badge className="bg-warning text-warning-foreground text-[10px] uppercase">Maybe</Badge>;
  if (status === "not_going")
    return <Badge variant="secondary" className="text-[10px] uppercase">Can't go</Badge>;
  return <Badge variant="outline" className="text-[10px] uppercase">No reply</Badge>;
}

/**
 * Redesigned, mobile-first member dashboard. Single column, card-based, with a
 * single highest-priority action up top followed by the next session, a short
 * list of upcoming sessions, and a lightweight activity summary.
 */
export function MemberDashboard({
  firstName,
  clubName,
  upcoming,
  myRsvps,
  loaded,
}: MemberDashboardProps) {
  const { user } = useAuth();
  const { activeClub } = useClub();
  const { notifications } = useNotifications();

  const [activity, setActivity] = useState<{ attended: number; total: number } | null>(null);

  // My attendance — past sessions for this club where this user has a marked row.
  useEffect(() => {
    if (!activeClub || !user) return;
    let cancelled = false;
    (async () => {
      const nowIso = new Date().toISOString();
      const { data: past } = await supabase
        .from("sessions")
        .select("id")
        .eq("club_id", activeClub.club_id)
        .lte("starts_at", nowIso);
      const ids = (past ?? []).map((s) => s.id);
      if (ids.length === 0) {
        if (!cancelled) setActivity({ attended: 0, total: 0 });
        return;
      }
      const { data: rows } = await supabase
        .from("session_attendance")
        .select("status")
        .eq("user_id", user.id)
        .in("session_id", ids);
      const marked = rows ?? [];
      const attended = marked.filter((r) => r.status === "present").length;
      if (!cancelled) setActivity({ attended, total: marked.length });
    })();
    return () => {
      cancelled = true;
    };
  }, [activeClub?.club_id, user?.id]);

  const nextSession = upcoming[0];
  const nextRsvp = nextSession ? myRsvps[nextSession.id] ?? null : null;
  const latestUnread = notifications.find((n) => !n.is_read);

  const attendancePct =
    activity && activity.total > 0 ? Math.round((activity.attended / activity.total) * 100) : null;

  return (
    <div className="space-y-4">
      {/* 1. Greeting */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {greetingForNow()}{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{clubName}</p>
      </div>

      {/* 2. Primary action (one only, highest priority wins) */}
      {loaded && <PrimaryAction nextSession={nextSession} nextRsvp={nextRsvp} latestUnread={latestUnread} />}

      {/* 3. Next session */}
      {loaded && nextSession && (
        <NextSessionCard session={nextSession} rsvp={nextRsvp} />
      )}

      {/* 4. Upcoming sessions */}
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
                <RsvpBadge status={myRsvps[s.id]} />
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
            <Link to="/sessions" className="block pt-1 text-sm font-medium text-[#FF6600]">
              View all →
            </Link>
          </div>
        )}
      </DashboardCard>

      {/* 5. My activity (lightweight) */}
      <DashboardCard
        icon={<Activity className="h-5 w-5" />}
        title="My activity"
        supportingText="Your training attendance"
      >
        {activity === null ? (
          <div className="h-5 animate-pulse rounded bg-muted/30" aria-busy="true" />
        ) : (
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">
                {attendancePct === null ? "—" : `${attendancePct}%`}
              </span>{" "}
              attendance
            </span>
            <span>
              <span className="font-medium text-foreground">{activity.attended}</span> attended
            </span>
          </div>
        )}
      </DashboardCard>
    </div>
  );
}

/** Destination for a notification, mirroring the bell's own routing. */
function notificationLink(type: string, relatedId: string | null): string | null {
  if (!relatedId) return null;
  switch (type) {
    case "new_session":
    case "session_updated":
    case "wave_draw_published":
      return `/sessions/${relatedId}`;
    case "carpool_update":
      return `/sessions/${relatedId}/carpool`;
    default:
      return null;
  }
}

function PrimaryAction({
  nextSession,
  nextRsvp,
  latestUnread,
}: {
  nextSession: MemberSession | undefined;
  nextRsvp: string | null;
  latestUnread: ReturnType<typeof useNotifications>["notifications"][number] | undefined;
}) {
  // a. Unpublished RSVP for the next session
  if (nextSession && !nextRsvp) {
    return (
      <DashboardCard
        icon={<CalendarCheck className="h-5 w-5" />}
        title={`RSVP for ${nextSession.title}`}
        supportingText="Let your coach know if you can make it"
        action={
          <Button asChild size="sm" className="min-h-11">
            <Link to="/sessions/$sessionId" params={{ sessionId: nextSession.id }}>
              RSVP
            </Link>
          </Button>
        }
      />
    );
  }

  // b. Unread announcement / notification
  if (latestUnread) {
    const href = notificationLink(latestUnread.notification_type, latestUnread.related_id);
    return (
      <DashboardCard
        icon={<Megaphone className="h-5 w-5" />}
        title="New announcement"
        supportingText={latestUnread.message || "You have an unread update"}
        action={
          href ? (
            <Button asChild size="sm" variant="secondary" className="min-h-11">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Link to={href as any}>View</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  // c. Carpool available for the next session
  if (nextSession?.carpool_enabled) {
    return (
      <DashboardCard
        icon={<Car className="h-5 w-5" />}
        title={`Carpool available for ${nextSession.title}`}
        supportingText="Find a ride or offer one to the squad"
        action={
          <Button asChild size="sm" variant="secondary" className="min-h-11">
            <Link to="/sessions/$sessionId/carpool" params={{ sessionId: nextSession.id }}>
              View
            </Link>
          </Button>
        }
      />
    );
  }

  // d. All set
  return (
    <DashboardCard
      className="border-success/30 bg-success/5"
      icon={<CheckCircle2 className="h-5 w-5 text-success" />}
      title={nextSession ? `You're all set for ${nextSession.title}` : "You're all set"}
      supportingText="Nothing needs your attention right now"
    />
  );
}

function NextSessionCard({ session, rsvp }: { session: MemberSession; rsvp: string | null }) {
  const { weather } = useWeatherTidesData({
    sessionId: session.id,
    startsAt: session.starts_at,
  });

  return (
    <DashboardCard
      icon={<Calendar className="h-5 w-5" />}
      title="Next session"
      supportingText={session.title}
      action={
        <Button asChild size="sm" variant="outline" className="min-h-11">
          <Link to="/sessions/$sessionId" params={{ sessionId: session.id }}>
            View
          </Link>
        </Button>
      }
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
        {weather && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>
              {weather.emoji} {weather.maxTemp}°C · {weather.windSpeed}km/h {weather.windDir}
              {weather.uvIndex != null ? ` · UV ${weather.uvIndex}` : ""}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-muted-foreground">Your RSVP:</span>
          <RsvpBadge status={rsvp} />
        </div>
      </div>
    </DashboardCard>
  );
}
