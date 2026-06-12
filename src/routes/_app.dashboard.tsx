import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { addDays, format, isAfter } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useClub, useCanManage, useIsAdmin } from "@/lib/club-context";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Plus, Users, ShieldCheck, Shield, ClipboardList, CheckCircle2, Dumbbell } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useIsPlatformOwner } from "@/lib/platform-owner";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";

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
    const [sess, members, pending, rsvps, next7Sess] = await Promise.all([
      supabase.from("sessions")
        .select("id, title, starts_at, location, session_type, ends_at")
        .eq("club_id", activeClub.club_id)
        .or(`ends_at.gte.${nowIso},and(ends_at.is.null,starts_at.gte.${nowIso})`)
        .order("starts_at", { ascending: true })
        .limit(5),
      supabase.from("club_memberships").select("id", { count: "exact", head: true })
        .eq("club_id", activeClub.club_id).eq("status", "approved"),
      supabase.from("club_memberships").select("id", { count: "exact", head: true })
        .eq("club_id", activeClub.club_id).eq("status", "pending"),
      supabase.from("session_rsvps").select("session_id, status").eq("user_id", user.id),
      supabase.from("sessions")
        .select("id, session_type, survey_enabled")
        .eq("club_id", activeClub.club_id)
        .gte("starts_at", nowIso)
        .lte("starts_at", in7Iso),
    ]);
    setUpcoming((sess.data ?? []) as Upcoming[]);
    setMemberCount(members.count ?? 0);
    setPendingCount(pending.count ?? 0);
    const map: Record<string, string> = {};
    (rsvps.data ?? []).forEach((r) => { map[r.session_id] = r.status; });
    setMyRsvps(map);

    // Compute next-7 metrics
    const list = (next7Sess.data ?? []) as { id: string; session_type: string; survey_enabled: boolean }[];
    const trainingCount = list.filter((s) => s.session_type === "training").length;
    const respondedIds = new Set(Object.keys(map));
    const rsvpsPending = list.filter((s) => !respondedIds.has(s.id)).length;

    const surveyIds = list.filter((s) => s.survey_enabled).map((s) => s.id);
    let surveysPending = 0;
    if (surveyIds.length > 0) {
      const { data: qs } = await supabase
        .from("session_survey_questions")
        .select("session_id, id, required")
        .in("session_id", surveyIds);
      const requiredBySession = new Map<string, string[]>();
      ((qs ?? []) as { session_id: string; id: string; required: boolean }[]).forEach((q) => {
        if (!q.required) return;
        const arr = requiredBySession.get(q.session_id) ?? [];
        arr.push(q.id); requiredBySession.set(q.session_id, arr);
      });
      const sessionsWithRequired = Array.from(requiredBySession.keys());
      if (sessionsWithRequired.length > 0) {
        const { data: rs } = await supabase
          .from("session_survey_responses")
          .select("question_id, session_id, answer_text, answer_bool, answer_choice")
          .in("session_id", sessionsWithRequired)
          .eq("user_id", user.id);
        const answered = new Set(
          ((rs ?? []) as { question_id: string; answer_text: string | null; answer_bool: boolean | null; answer_choice: string | null }[])
            .filter((r) => r.answer_text !== null || r.answer_bool !== null || r.answer_choice !== null)
            .map((r) => r.question_id),
        );
        for (const [sid, qids] of requiredBySession.entries()) {
          if (!qids.every((id) => answered.has(id))) surveysPending += 1;
        }
      }
    }
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

  return (
    <AppShell>
      <div className="mb-5">
        <p className="text-sm text-muted-foreground">Welcome back</p>
        <h1 className="text-2xl font-bold tracking-tight">{activeClub.club.name}</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
            <Users className="h-3.5 w-3.5" /> Members
          </div>
          <div className="mt-1 text-2xl font-bold">{memberCount ?? "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
            <Calendar className="h-3.5 w-3.5" /> Upcoming
          </div>
          <div className="mt-1 text-2xl font-bold">{loaded ? upcoming.length : "—"}</div>
        </Card>
      </div>

      <div className="mb-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Next 7 days</div>
        <div className="grid grid-cols-1 gap-2">
          <DashAction
            icon={<ClipboardList className="h-4 w-4 text-primary" />}
            label="Surveys to complete"
            count={next7.surveysPending}
            cta="Complete Surveys"
            to="/sessions"
            tone={next7.surveysPending > 0 ? "warning" : "muted"}
          />
          <DashAction
            icon={<CheckCircle2 className="h-4 w-4 text-primary" />}
            label="RSVPs to complete"
            count={next7.rsvpsPending}
            cta="Complete RSVPs"
            to="/sessions"
            tone={next7.rsvpsPending > 0 ? "warning" : "muted"}
          />
          <DashAction
            icon={<Dumbbell className="h-4 w-4 text-primary" />}
            label="Upcoming training"
            count={next7.trainingCount}
            cta="View Sessions"
            to="/sessions"
            tone="muted"
          />
        </div>
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
        <Card className="mb-5 p-4 border-warning/40 bg-warning/10">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium">{pendingCount} join request{pendingCount === 1 ? "" : "s"} waiting</div>
              <p className="text-sm text-muted-foreground">Review and approve members.</p>
            </div>
            <Button asChild size="sm" variant="secondary">
              <Link to="/members" search={{ tab: "pending" }}>Review</Link>
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

function DashAction({ icon, label, count, cta, to, tone }: {
  icon: React.ReactNode;
  label: string;
  count: number;
  cta: string;
  to: string;
  tone: "warning" | "muted";
}) {
  const border = tone === "warning" ? "border-warning/40 bg-warning/10" : "";
  return (
    <Card className={`p-3 flex items-center gap-3 ${border}`}>
      <div className="shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-2xl font-bold leading-tight">{count}</div>
      </div>
      <Button asChild size="sm" variant={tone === "warning" ? "default" : "outline"}>
        <Link to={to as "/sessions"}>{cta}</Link>
      </Button>
    </Card>
  );
}
