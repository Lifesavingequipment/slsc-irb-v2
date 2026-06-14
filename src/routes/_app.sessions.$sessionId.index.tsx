import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCanManage, useIsAdmin, useClub } from "@/lib/club-context";
import { useConfirm } from "@/lib/confirm";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Calendar, MapPin, ChevronLeft, Users, Trash2, Clock, Plus, Share2, Lock, Pencil, RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import { WavePanel } from "@/components/session/WavePanel";
import { SurveyEditor, SurveyRunner, SurveyResults, usePretrainingSurveyStatus } from "@/components/session/SurveyPanel";
import { TrainingPlanView, TrainingPlanEditor } from "@/components/session/TrainingPlanPanel";
import { useCoachPermissions } from "@/lib/coach-permissions";
import { buildNameMap, memberFullName } from "@/lib/names";
import { invalidateSessionsCache, removeSessionFromCache } from "./_app.sessions.index";

export const Route = createFileRoute("/_app/sessions/$sessionId/")({
  head: () => ({ meta: [{ title: "Session — IRB Coaching" }] }),
  component: SessionDetail,
});

type Session = {
  id: string; club_id: string; title: string; session_type: string;
  location: string | null; starts_at: string; ends_at: string | null;
  rsvp_deadline: string | null;
  capacity: number | null; notes: string | null;
  survey_enabled: boolean; carpool_enabled: boolean;
};

type RsvpStatus = "going" | "maybe" | "not_going";
type AttStatus = "present" | "absent" | "excused" | "injured";

type Rsvp = {
  id: string; user_id: string; member_id: string | null; status: RsvpStatus;
  profile: { display_name: string } | null;
};

type Team = {
  id: string; session_id: string; wave: number; lane: number;
  wave_name: string | null;
  driver_id: string | null; crew_id: string | null; patient_id: string | null;
  notes: string | null;
};

type Attendance = {
  id: string; user_id: string; status: AttStatus; note: string | null;
};

type Member = { id: string; auth_user_id: string | null; user_id: string; display_name: string; driver_flag: boolean; crew_flag: boolean };

const STATUS_LABELS: Record<RsvpStatus, string> = {
  going: "Going", maybe: "Maybe", not_going: "Can't go",
};
const ATT_LABELS: Record<AttStatus, string> = {
  present: "Present", absent: "Absent", excused: "Excused", injured: "Injured",
};


function SessionDetail() {
  const { sessionId } = Route.useParams();
  const { user } = useAuth();
  const { activeClub } = useClub();
  const canManage = useCanManage();
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [session, setSession] = useState<Session | null>(null);
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [busy, setBusy] = useState(false);
  const { perms } = useCoachPermissions(session?.club_id ?? null);
  const surveyStatus = usePretrainingSurveyStatus(sessionId, user?.id ?? null);

  const load = useCallback(async () => {
    const { data: s } = await supabase.from("sessions").select("*").eq("id", sessionId).maybeSingle();
    setSession(s as Session | null);
    const { data: r } = await supabase
      .from("session_rsvps")
      .select("id, user_id, member_id, status")
      .eq("session_id", sessionId);
    const rsvpRows = (r ?? []) as { id: string; user_id: string | null; member_id: string | null; status: RsvpStatus }[];
    const rsvpUserIds = rsvpRows.map((x) => x.user_id).filter(Boolean) as string[];
    const rsvpMemberIds = rsvpRows.map((x) => x.member_id).filter(Boolean) as string[];
    let profByAuthId = new Map<string, { display_name: string }>();
    let profByMemberId = new Map<string, { display_name: string }>();
    if (s?.club_id && (rsvpUserIds.length > 0 || rsvpMemberIds.length > 0)) {
      const orFilters: string[] = [];
      if (rsvpUserIds.length > 0) orFilters.push(`auth_user_id.in.(${rsvpUserIds.join(",")})`);
      if (rsvpMemberIds.length > 0) orFilters.push(`id.in.(${rsvpMemberIds.join(",")})`);
      const { data: memData } = await supabase
        .from("members")
        .select("id, auth_user_id, first_name, last_name, preferred_name")
        .or(orFilters.join(","))
        .eq("club_id", s.club_id);
      for (const m of memData ?? []) {
        const name = { display_name: memberFullName(m, "Member") };
        if (m.auth_user_id) profByAuthId.set(m.auth_user_id, name);
        profByMemberId.set(m.id, name);
      }
    }
    setRsvps(rsvpRows.map((x) => ({
      id: x.id,
      user_id: x.user_id ?? x.member_id ?? x.id,
      member_id: x.member_id ?? null,
      status: x.status,
      profile: (x.user_id ? profByAuthId.get(x.user_id) : null) ?? (x.member_id ? profByMemberId.get(x.member_id) : null) ?? null,
    })));
    const { data: t } = await supabase.from("session_teams").select("*")
      .eq("session_id", sessionId).order("wave").order("lane");
    setTeams((t ?? []) as Team[]);
    const { data: a } = await supabase.from("session_attendance").select("id, user_id, status, note")
      .eq("session_id", sessionId);
    setAttendance((a ?? []) as Attendance[]);
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  // Load all approved members of the club for selectors / coach view
  useEffect(() => {
    if (!session?.club_id) return;
    (async () => {
      const { data: memData } = await supabase
        .from("members")
        .select("id, auth_user_id, first_name, last_name, preferred_name, driver_flag, crew_flag")
        .eq("club_id", session.club_id)
        .eq("membership_status", "active")
        .order("first_name");
      const list: Member[] = (memData ?? []).map((m) => ({
        id: m.id,
        auth_user_id: m.auth_user_id ?? null,
        user_id: m.auth_user_id ?? m.id,
        display_name: memberFullName(m, "Member"),
        driver_flag: m.driver_flag ?? false,
        crew_flag: m.crew_flag ?? false,
      }));
      list.sort((a, b) => a.display_name.localeCompare(b.display_name));
      setMembers(list);
    })();
  }, [session?.club_id]);

  const myRsvp = rsvps.find((x) => x.user_id === user?.id)?.status ?? null;

  const rsvpClosed = useMemo(() => {
    if (!session?.rsvp_deadline) return false;
    return new Date(session.rsvp_deadline).getTime() < Date.now();
  }, [session?.rsvp_deadline]);

  const rsvp = async (status: RsvpStatus) => {
    if (!user || rsvpClosed) return;
    const prev = rsvps;
    // Optimistic: insert/replace this user's row immediately.
    setRsvps((cur) => {
      const without = cur.filter((r) => r.user_id !== user.id);
      const existing = cur.find((r) => r.user_id === user.id);
      return [
        ...without,
        {
          id: existing?.id ?? `optimistic-${user.id}`,
          user_id: user.id,
          status,
          profile: existing?.profile ?? null,
        },
      ];
    });
    const { data, error } = await supabase.from("session_rsvps").upsert(
      { session_id: sessionId, user_id: user.id, status },
      { onConflict: "session_id,user_id" },
    ).select("id, user_id, status").maybeSingle();
    if (error) {
      setRsvps(prev);
      toast.error(error.message);
      return;
    }
    if (data) {
      setRsvps((cur) =>
        cur.map((r) =>
          r.user_id === user.id
            ? { ...r, id: data.id, status: data.status as RsvpStatus }
            : r,
        ),
      );
    }
  };

  const setRsvpFor = async (userId: string, status: RsvpStatus | null) => {
    const prev = rsvps;
    setRsvps((cur) => {
      const without = cur.filter((r) => r.user_id !== userId);
      if (status === null) return without;
      const existing = cur.find((r) => r.user_id === userId);
      return [
        ...without,
        {
          id: existing?.id ?? `optimistic-${userId}`,
          user_id: userId,
          status,
          profile: existing?.profile ?? null,
        },
      ];
    });
    if (status === null) {
      const { error } = await supabase.from("session_rsvps")
        .delete().eq("session_id", sessionId).eq("user_id", userId);
      if (error) {
        setRsvps(prev);
        toast.error(error.message);
        return;
      }
      return;
    }
    const { data, error } = await supabase.from("session_rsvps").upsert(
      { session_id: sessionId, user_id: userId, status },
      { onConflict: "session_id,user_id" },
    ).select("id, user_id, status").maybeSingle();
    if (error) {
      setRsvps(prev);
      toast.error(error.message);
      return;
    }
    if (data) {
      setRsvps((cur) =>
        cur.map((r) =>
          r.user_id === userId
            ? { ...r, id: data.id, status: data.status as RsvpStatus }
            : r,
        ),
      );
    }
  };

  const markForMember = async (userId: string, status: RsvpStatus) => {
    const prev = rsvps;
    const member = members.find((m) => m.user_id === userId);
    setRsvps((cur) => {
      const without = cur.filter((r) => r.user_id !== userId);
      return [
        ...without,
        {
          id: `optimistic-${userId}`,
          user_id: userId,
          status,
          profile: member ? { display_name: member.display_name } : null,
        },
      ];
    });
    const memberId = member?.id ?? userId;
    const { data: existing, error: checkErr } = await supabase
      .from("session_rsvps")
      .select("id")
      .eq("session_id", sessionId)
      .eq("member_id", memberId)
      .maybeSingle();
    if (checkErr) {
      setRsvps(prev);
      toast.error(checkErr.message);
      return;
    }
    let savedId: string | null = null;
    if (existing) {
      const { error } = await supabase.from("session_rsvps").update({ status }).eq("id", existing.id);
      if (error) { setRsvps(prev); toast.error(error.message); return; }
      savedId = existing.id;
    } else {
      const { data: inserted, error } = await supabase.from("session_rsvps").insert({
        session_id: sessionId,
        member_id: memberId,
        user_id: member?.auth_user_id ?? null,
        status,
      }).select("id").maybeSingle();
      if (error) { setRsvps(prev); toast.error(error.message); return; }
      savedId = inserted?.id ?? null;
    }
    if (savedId) {
      setRsvps((cur) =>
        cur.map((r) =>
          r.user_id === userId
            ? { ...r, id: savedId!, status }
            : r,
        ),
      );
    }
  };



  const remove = async () => {
    const ok = await confirm({
      title: "Delete this session?",
      description: "RSVPs, attendance, carpools and team draws for this session will all be removed.",
    });
    if (!ok) return;
    const { data: deleted, error } = await supabase
      .from("sessions")
      .delete()
      .eq("id", sessionId)
      .select("id");
    if (error) { toast.error(error.message); return; }
    if (!deleted || deleted.length === 0) {
      toast.error("You don't have permission to delete this session.");
      return;
    }
    const clubId = session?.club_id ?? activeClub?.club_id;
    if (clubId) removeSessionFromCache(clubId, sessionId);
    else invalidateSessionsCache();
    toast.success("Session deleted");
    navigate({ to: "/sessions", replace: true });
  };

  // Unified display-name map across every visible name on this screen.
  const nameMap = useMemo(() => {
    const people = new Map<string, { id: string; full_name: string | null }>();
    for (const m of members) people.set(m.user_id, { id: m.user_id, full_name: m.display_name });
    for (const r of rsvps) {
      if (!people.has(r.user_id)) {
        people.set(r.user_id, { id: r.user_id, full_name: r.profile?.display_name ?? null });
      }
    }
    return buildNameMap(Array.from(people.values()));
  }, [members, rsvps]);
  const dn = useCallback(
    (id: string | null | undefined) => (id && nameMap[id]) || "Member",
    [nameMap],
  );
  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => dn(a.user_id).localeCompare(dn(b.user_id))),
    [members, dn],
  );

  const goingMemberIds = useMemo(
    () =>
      rsvps
        .filter((r) => r.status === "going")
        .map((g) =>
          g.member_id
            ? g.member_id
            : members.find((m) => m.auth_user_id === g.user_id)?.id ?? null,
        )
        .filter((id): id is string => id !== null),
    [rsvps, members],
  );

  if (!session) {
    return <AppShell><div className="py-12 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;
  }

  const byName = (a: { user_id: string }, b: { user_id: string }) =>
    dn(a.user_id).localeCompare(dn(b.user_id));

  const going = rsvps.filter((r) => r.status === "going").slice().sort(byName);
  const maybe = rsvps.filter((r) => r.status === "maybe").slice().sort(byName);
  const not = rsvps.filter((r) => r.status === "not_going").slice().sort(byName);
  const respondedIds = new Set(rsvps.map((r) => r.user_id));
  const notResponded = members.filter((m) => !respondedIds.has(m.user_id)).slice().sort(byName);

  return (
    <AppShell>
      <Link to="/sessions" className="inline-flex items-center text-sm text-muted-foreground mb-2">
        <ChevronLeft className="h-4 w-4" /> Sessions
      </Link>

      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Badge variant="secondary" className="text-[10px] uppercase">{session.session_type}</Badge>
            <h1 className="mt-2 text-2xl font-bold">{session.title}</h1>
          </div>
          {rsvpClosed && (
            <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> RSVP closed</Badge>
          )}
        </div>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {format(new Date(session.starts_at), "EEEE d MMM yyyy · h:mma")}
            {session.ends_at && <>– {format(new Date(session.ends_at), "h:mma")}</>}
          </div>
          {session.location && (
            <div className="flex items-center gap-2"><MapPin className="h-4 w-4" /> {session.location}</div>
          )}
          {session.rsvp_deadline && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" /> RSVP by {format(new Date(session.rsvp_deadline), "EEE d MMM, h:mma")}
            </div>
          )}
          {session.capacity && (
            <div className="flex items-center gap-2"><Users className="h-4 w-4" /> Capacity {going.length}/{session.capacity}</div>
          )}
        </div>
        {session.notes && <p className="mt-4 text-sm whitespace-pre-wrap">{session.notes}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {(session.carpool_enabled || canManage) && (
            <Button asChild variant="outline" size="sm">
              <Link to="/sessions/$sessionId/carpool" params={{ sessionId }}>
                <Users className="h-4 w-4 mr-2" /> Carpool & transport
                {!session.carpool_enabled && canManage && (
                  <Badge variant="outline" className="ml-2 text-[10px]">Off</Badge>
                )}
              </Link>
            </Button>
          )}
          {canManage && (
            <Button asChild variant="outline" size="sm">
              <Link to="/sessions/$sessionId/edit" params={{ sessionId }}>
                <Pencil className="h-4 w-4 mr-2" /> Edit session
              </Link>
            </Button>
          )}
        </div>
      </Card>

      <Tabs defaultValue="rsvp" className="mt-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="rsvp">RSVPs</TabsTrigger>
          <TabsTrigger value="plan">Plan</TabsTrigger>
          {session.survey_enabled && <TabsTrigger value="survey">Survey</TabsTrigger>}
          <TabsTrigger value="waves">Waves</TabsTrigger>
          <TabsTrigger value="gear">Gear</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
        </TabsList>

        <TabsContent value="rsvp" className="space-y-4 mt-4">

          {session.survey_enabled && surveyStatus.required && !surveyStatus.complete && !canManage && user && (
            <SurveyRunner
              sessionId={sessionId}
              clubId={session.club_id}
              userId={user.id}
              onComplete={surveyStatus.refresh}
            />
          )}

          <Card className="p-4">
            <div className="text-sm font-semibold mb-3">Your response</div>
            <div className="grid grid-cols-3 gap-2">
              {(["going", "maybe", "not_going"] as const).map((s) => {
                const blocked = session.survey_enabled && surveyStatus.required && !surveyStatus.complete && !canManage;
                return (
                  <Button
                    key={s}
                    variant={myRsvp === s ? "default" : "outline"}
                    disabled={busy || rsvpClosed || blocked}
                    onClick={() => rsvp(s)}
                    className="h-11"
                  >
                    {STATUS_LABELS[s]}
                  </Button>
                );
              })}
            </div>
            {rsvpClosed && (
              <p className="mt-2 text-xs text-muted-foreground">The RSVP deadline has passed.</p>
            )}
            {session.survey_enabled && surveyStatus.required && !surveyStatus.complete && !canManage && (
              <p className="mt-2 text-xs text-warning">Complete the pre-training survey above before you can RSVP.</p>
            )}
          </Card>

          <RsvpList title={`Going (${going.length})`} rows={going} tone="success"
            canManage={canManage} busy={busy} onSetStatus={setRsvpFor} nameOf={dn} />
          {maybe.length > 0 && <RsvpList title={`Maybe (${maybe.length})`} rows={maybe} tone="warning"
            canManage={canManage} busy={busy} onSetStatus={setRsvpFor} nameOf={dn} />}
          {not.length > 0 && <RsvpList title={`Can't go (${not.length})`} rows={not} tone="muted"
            canManage={canManage} busy={busy} onSetStatus={setRsvpFor} nameOf={dn} />}

          {canManage && (
            <MarkAttendingPanel
              notResponded={notResponded}
              onMark={markForMember}
            />
          )}
        </TabsContent>

        <TabsContent value="plan" className="space-y-4 mt-4">
          {canManage && (perms.manage_training_plans || isAdmin) ? (
            <TrainingPlanEditor
              sessionId={sessionId}
              clubId={session.club_id}
              canManageTemplates={isAdmin || perms.manage_templates}
            />
          ) : (
            <TrainingPlanView sessionId={sessionId} />
          )}
        </TabsContent>

        {session.survey_enabled && (
          <TabsContent value="survey" className="space-y-4 mt-4">
            {canManage ? (
              <>
                <SurveyEditor
                  sessionId={sessionId}
                  clubId={session.club_id}
                  canManageTemplates={isAdmin || perms.manage_templates}
                />
                {(isAdmin || perms.view_survey_results) && <SurveyResults sessionId={sessionId} />}
              </>
            ) : user ? (
              <SurveyRunner
                sessionId={sessionId}
                clubId={session.club_id}
                userId={user.id}
                onComplete={surveyStatus.refresh}
              />
            ) : null}
          </TabsContent>
        )}

        <TabsContent value="waves" className="space-y-4 mt-4">
          <WavePanel
            sessionId={sessionId}
            clubId={session.club_id}
            sessionTitle={session.title}
            sessionStartsAt={session.starts_at}
            goingIds={goingMemberIds}
            canManage={canManage}
          />
        </TabsContent>


        <TabsContent value="gear" className="space-y-4 mt-4">
          <ChecklistPanel
            sessionId={sessionId}
            clubId={session.club_id}
            canManage={canManage}
          />
        </TabsContent>

        <TabsContent value="attendance" className="space-y-4 mt-4">
          <AttendancePanel
            sessionId={sessionId}
            attendance={attendance}
            setAttendance={setAttendance}
            members={sortedMembers}
            rsvpIds={rsvps.map((r) => r.user_id)}
            canManage={canManage}
            currentUserId={user?.id ?? null}
            clubId={activeClub?.club_id ?? null}
            onChange={load}
            nameOf={dn}
          />
        </TabsContent>
      </Tabs>


      {isAdmin && (
        <div className="mt-6">
          <Button variant="outline" className="w-full text-destructive border-destructive/30 hover:bg-destructive/10" onClick={remove}>
            <Trash2 className="h-4 w-4 mr-2" /> Delete session
          </Button>
        </div>
      )}
    </AppShell>
  );
}

function RsvpList({ title, rows, tone, canManage, busy, onSetStatus, nameOf }: {
  title: string; rows: Rsvp[]; tone: "success" | "warning" | "muted";
  canManage?: boolean; busy?: boolean;
  onSetStatus?: (userId: string, status: RsvpStatus | null) => void;
  nameOf: (id: string) => string;
}) {
  const dot = tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-muted-foreground";
  const borderClass = tone === "success"
    ? "border-l-4 border-l-green-500"
    : tone === "warning"
    ? "border-l-4 border-l-yellow-400"
    : "border-l-4 border-l-gray-400";
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <div className="text-sm font-semibold">{title}</div>
      </div>
      <div className="space-y-1">
        {rows.map((r) => {
          return (
            <div key={r.id} className={`flex items-center justify-between gap-2 py-1 pl-2 rounded ${borderClass}`}>
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className="text-sm truncate">{nameOf(r.user_id)}</span>
              </div>
              {canManage && onSetStatus && (
                <Select
                  value={r.status}
                  onValueChange={(v) => onSetStatus(r.user_id, v === "clear" ? null : (v as RsvpStatus))}
                  disabled={busy}
                >
                  <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="going">Going</SelectItem>
                    <SelectItem value="maybe">Maybe</SelectItem>
                    <SelectItem value="not_going">Can't go</SelectItem>
                    <SelectItem value="clear">Clear</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          );
        })}
        {rows.length === 0 && <div className="text-xs text-muted-foreground">No one yet.</div>}
      </div>
    </Card>
  );
}

/* --------------------------- Mark Attending --------------------------- */

function MarkAttendingPanel({
  notResponded,
  onMark,
}: {
  notResponded: Member[];
  onMark: (userId: string, status: RsvpStatus) => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const filtered = notResponded.filter((m) =>
    m.display_name.toLowerCase().includes(search.toLowerCase()),
  );

  const toggle = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };

  const remove = (userId: string) => {
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(userId); return next; });
  };

  const handleMark = async (status: RsvpStatus) => {
    if (selectedIds.size === 0) return;
    setBusy(true);
    for (const userId of selectedIds) {
      await onMark(userId, status);
    }
    setSelectedIds(new Set());
    setBusy(false);
  };

  const selectedMembers = notResponded.filter((m) => selectedIds.has(m.user_id));

  return (
    <Card className="p-4">
      <div className="text-sm font-semibold mb-3">Mark Attending</div>
      {notResponded.length === 0 ? (
        <p className="text-xs text-muted-foreground">All members have responded.</p>
      ) : (
        <div className="space-y-3">
          {selectedMembers.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedMembers.map((m) => (
                <Badge key={m.user_id} variant="secondary" className="gap-1 pr-1">
                  {m.display_name}
                  <button
                    type="button"
                    onClick={() => remove(m.user_id)}
                    className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                    aria-label={`Remove ${m.display_name}`}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <Input
            placeholder="Search members…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
          />

          <div className="max-h-48 overflow-y-auto rounded border divide-y">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">No members found.</div>
            ) : filtered.map((m) => (
              <button
                key={m.user_id}
                type="button"
                onClick={() => toggle(m.user_id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors ${
                  selectedIds.has(m.user_id) ? "bg-muted font-medium" : ""
                }`}
              >
                <span className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 text-xs ${
                  selectedIds.has(m.user_id) ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"
                }`}>
                  {selectedIds.has(m.user_id) ? "✓" : ""}
                </span>
                {m.display_name}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <Button
              disabled={selectedIds.size === 0 || busy}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              onClick={() => handleMark("going")}
            >
              Going{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
            </Button>
            <Button
              variant="secondary"
              disabled={selectedIds.size === 0 || busy}
              className="flex-1"
              onClick={() => handleMark("not_going")}
            >
              Can't go{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ----------------------------- Waves / Teams ----------------------------- */

function TeamsPanel({
  sessionId, teams, members, goingIds, session, canManage, onChange,
}: {
  sessionId: string;
  teams: Team[];
  members: Member[];
  goingIds: string[];
  session: Session;
  canManage: boolean;
  onChange: () => void;
}) {
  const confirm = useConfirm();
  // Only confirmed (going) members are assignable
  const goingSet = new Set(goingIds);
  const eligible = members.filter((m) => goingSet.has(m.user_id));
  // Always include anyone already assigned (in case their RSVP changed later)
  const assignedIds = new Set<string>();
  teams.forEach((t) => {
    [t.driver_id, t.crew_id, t.patient_id].forEach((id) => { if (id) assignedIds.add(id); });
  });
  const extras = members.filter((m) => assignedIds.has(m.user_id) && !goingSet.has(m.user_id));
  const pickable = [...eligible, ...extras];

  const memberName = (id: string | null) =>
    id ? members.find((m) => m.user_id === id)?.display_name ?? "Member" : "—";

  const grouped = useMemo(() => {
    return teams.reduce<Record<number, Team[]>>((acc, t) => {
      (acc[t.wave] ||= []).push(t); return acc;
    }, {});
  }, [teams]);

  const addLane = async (wave: number) => {
    const lanesInWave = teams.filter((t) => t.wave === wave);
    const lane = (lanesInWave.reduce((mx, t) => Math.max(mx, t.lane), 0) || 0) + 1;
    if (lane > 5) { toast.error("Max 5 lanes per wave"); return; }
    const { error } = await supabase.from("session_teams").insert({
      session_id: sessionId, wave, lane,
    });
    if (error) toast.error(error.message); else onChange();
  };

  const addWave = async () => {
    const nextWave = (Object.keys(grouped).map(Number).reduce((mx, w) => Math.max(mx, w), 0) || 0) + 1;
    const { error } = await supabase.from("session_teams").insert({
      session_id: sessionId, wave: nextWave, lane: 1,
    });
    if (error) toast.error(error.message); else onChange();
  };

  const updateTeam = async (id: string, patch: Partial<Team>) => {
    const { error } = await supabase.from("session_teams").update(patch).eq("id", id);
    if (error) toast.error(error.message); else onChange();
  };

  const assign = async (
    team: Team, role: "driver_id" | "crew_id" | "patient_id", value: string | null,
  ) => {
    if (value) {
      // Check duplicate in same wave (other lanes / other roles)
      const dup = teams.some((t) => t.wave === team.wave && t.id !== team.id && (
        t.driver_id === value || t.crew_id === value || t.patient_id === value
      ));
      const sameLaneDup = (["driver_id", "crew_id", "patient_id"] as const)
        .some((r) => r !== role && team[r] === value);
      if (dup || sameLaneDup) {
        toast.error("That member is already in this wave");
        return;
      }
    }
    await updateTeam(team.id, { [role]: value } as Partial<Team>);
  };

  const deleteTeam = async (id: string) => {
    const ok = await confirm({ title: "Remove this lane?", description: "The driver/crew assignment will be cleared." });
    if (!ok) return;
    const { error } = await supabase.from("session_teams").delete().eq("id", id);
    if (error) toast.error(error.message); else onChange();
  };

  // Rotate patients forward by one lane within each wave (lane1's patient → lane2, last → lane1)
  const rotatePatients = async () => {
    const updates: { id: string; patient_id: string | null }[] = [];
    Object.keys(grouped).map(Number).forEach((w) => {
      const lanes = grouped[w].slice().sort((a, b) => a.lane - b.lane);
      if (lanes.length < 2) return;
      const patients = lanes.map((t) => t.patient_id);
      const rotated = [patients[patients.length - 1], ...patients.slice(0, -1)];
      lanes.forEach((t, i) => {
        if (t.patient_id !== rotated[i]) updates.push({ id: t.id, patient_id: rotated[i] });
      });
    });
    if (!updates.length) { toast.info("Nothing to rotate (need 2+ lanes per wave)."); return; }
    const results = await Promise.all(
      updates.map((u) => supabase.from("session_teams").update({ patient_id: u.patient_id }).eq("id", u.id)),
    );
    const err = results.find((r) => r.error)?.error;
    if (err) { toast.error(err.message); return; }
    toast.success("Patients rotated");
    onChange();
  };


  const share = async () => {
    const lines: string[] = [];
    lines.push(`Training Session: ${session.title} — ${format(new Date(session.starts_at), "EEE d MMM yyyy")}`);
    lines.push("");
    Object.keys(grouped).map(Number).sort((a, b) => a - b).forEach((w) => {
      const name = grouped[w].find((t) => t.wave_name)?.wave_name?.trim();
      lines.push(name ? `${name}` : `Wave ${w}`);
      grouped[w].slice().sort((a, b) => a.lane - b.lane).forEach((t) => {
        lines.push(`Lane ${t.lane}: Driver - ${memberName(t.driver_id)} | Crew - ${memberName(t.crew_id)} | Patient - ${memberName(t.patient_id)}`);
      });
      lines.push("");
    });
    const text = lines.join("\n").trim();
    try {
      if (navigator.share) {
        await navigator.share({ text, title: session.title });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success("Draw copied to clipboard");
      }
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        toast.success("Draw copied to clipboard");
      } catch { /* ignore */ }
    }
  };

  if (!canManage && teams.length === 0) {
    return (
      <Card className="p-4 text-sm text-muted-foreground text-center">
        The draw hasn't been set yet.
      </Card>
    );
  }

  const waves = Object.keys(grouped).map(Number).sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={addWave} variant="outline" className="flex-1 min-w-[120px]">
            <Plus className="h-4 w-4 mr-1" /> Add wave
          </Button>
          <Button onClick={rotatePatients} variant="outline" className="flex-1 min-w-[120px]" disabled={teams.length < 2}>
            <RotateCw className="h-4 w-4 mr-1" /> Rotate patients
          </Button>
          <Button onClick={share} variant="outline" className="flex-1 min-w-[120px]" disabled={teams.length === 0}>
            <Share2 className="h-4 w-4 mr-1" /> Share draw
          </Button>
        </div>
      )}
      {!canManage && teams.length > 0 && (
        <Button onClick={share} variant="outline" className="w-full">
          <Share2 className="h-4 w-4 mr-1" /> Share draw
        </Button>
      )}

      {teams.length === 0 && canManage && (
        <Card className="p-4 text-sm text-muted-foreground text-center">
          No waves yet. Tap “Add wave” to start the draw.
        </Card>
      )}

      {waves.map((w) => {
        const lanes = grouped[w].slice().sort((a, b) => a.lane - b.lane);
        const waveName = lanes.find((t) => t.wave_name)?.wave_name ?? "";
        return (
          <Card key={w} className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold whitespace-nowrap">Wave {w}</div>
              {canManage ? (
                <Input
                  placeholder="Custom name (optional)"
                  defaultValue={waveName}
                  className="h-8 flex-1"
                  onBlur={(e) => {
                    const v = e.target.value.trim() || null;
                    lanes.forEach((t) => {
                      if ((t.wave_name ?? null) !== v) updateTeam(t.id, { wave_name: v });
                    });
                  }}
                />
              ) : waveName ? (
                <span className="text-sm text-muted-foreground">· {waveName}</span>
              ) : null}
            </div>

            {lanes.map((t) => {
              const missing = !t.driver_id || !t.crew_id || !t.patient_id;
              return (
                <div key={t.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Lane {t.lane}</div>
                    {canManage && (
                      <Button size="icon" variant="ghost" onClick={() => deleteTeam(t.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <RolePicker label="Driver" value={t.driver_id} members={pickable} disabled={!canManage}
                    onChange={(v) => assign(t, "driver_id", v)} />
                  <RolePicker label="Crew" value={t.crew_id} members={pickable} disabled={!canManage}
                    onChange={(v) => assign(t, "crew_id", v)} />
                  <RolePicker label="Patient" value={t.patient_id} members={pickable} disabled={!canManage}
                    onChange={(v) => assign(t, "patient_id", v)} />
                  {missing && (
                    <div className="text-[11px] text-warning">⚠ Missing {[
                      !t.driver_id && "driver", !t.crew_id && "crew", !t.patient_id && "patient",
                    ].filter(Boolean).join(", ")}.</div>
                  )}
                </div>
              );
            })}

            {canManage && lanes.length < 5 && (
              <Button variant="ghost" size="sm" className="w-full" onClick={() => addLane(w)}>
                <Plus className="h-4 w-4 mr-1" /> Add lane
              </Button>
            )}
          </Card>
        );
      })}
    </div>
  );
}


function RolePicker({ label, value, members, onChange, disabled }: {
  label: string;
  value: string | null;
  members: Member[];
  onChange: (v: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-[80px_1fr] items-center gap-2">
      <Label className="text-xs uppercase text-muted-foreground">{label}</Label>
      <Select
        value={value ?? "__none"}
        onValueChange={(v) => onChange(v === "__none" ? null : v)}
        disabled={disabled}
      >
        <SelectTrigger className="h-9"><SelectValue placeholder="Unassigned" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">Unassigned</SelectItem>
          {members.map((m) => (
            <SelectItem key={m.user_id} value={m.user_id}>{m.display_name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`text-xs font-medium ${className}`}>{children}</span>;
}

/* --------------------------- Attendance --------------------------- */

function AttendancePanel({
  sessionId, attendance, setAttendance, members, rsvpIds, canManage, currentUserId, clubId, onChange, nameOf,
}: {
  sessionId: string;
  attendance: Attendance[];
  setAttendance: React.Dispatch<React.SetStateAction<Attendance[]>>;
  members: Member[];
  rsvpIds: string[];
  canManage: boolean;
  currentUserId: string | null;
  clubId: string | null;
  onChange: () => void;
  nameOf: (id: string) => string;
}) {
  // Visible: anyone who RSVP'd (any status) + anyone already marked
  const targetIds = new Set<string>(rsvpIds);
  attendance.forEach((a) => targetIds.add(a.user_id));
  const targetList = members.filter((m) => targetIds.has(m.user_id));
  // Fallback for coaches: all club members if nothing yet
  const list = canManage && targetList.length === 0 ? members : targetList;

  const mark = async (userId: string, status: AttStatus) => {
    if (!clubId) return;
    const existing = attendance.find((a) => a.user_id === userId);
    // Optimistic update so summary counts refresh immediately.
    if (existing) {
      setAttendance((prev) =>
        prev.map((a) => (a.id === existing.id ? { ...a, status } : a)),
      );
      const { error } = await supabase.from("session_attendance")
        .update({ status, marked_by: currentUserId, marked_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) { toast.error(error.message); onChange(); return; }
    } else {
      const tempId = `temp-${userId}`;
      setAttendance((prev) => [...prev, { id: tempId, user_id: userId, status, note: null }]);
      const { error } = await supabase.from("session_attendance").insert({
        session_id: sessionId, user_id: userId, status, marked_by: currentUserId,
      });
      if (error) {
        setAttendance((prev) => prev.filter((a) => a.id !== tempId));
        toast.error(error.message);
        return;
      }
      onChange();
    }
  };

  const saveNote = async (userId: string, note: string) => {
    const trimmed = note.trim() || null;
    const existing = attendance.find((a) => a.user_id === userId);
    if (!existing) {
      // Need a status to insert; default to present
      const { error } = await supabase.from("session_attendance").insert({
        session_id: sessionId, user_id: userId, status: "present" as AttStatus,
        marked_by: currentUserId, note: trimmed,
      });
      if (error) { toast.error(error.message); return; }
    } else if ((existing.note ?? null) !== trimmed) {
      const { error } = await supabase.from("session_attendance")
        .update({ note: trimmed }).eq("id", existing.id);
      if (error) { toast.error(error.message); return; }
    }
    onChange();
  };

  if (!canManage) {
    const me = attendance.find((a) => a.user_id === currentUserId);
    return (
      <Card className="p-4">
        <div className="text-sm font-semibold mb-2">Your attendance</div>
        {me ? (
          <>
            <Badge variant="outline">{ATT_LABELS[me.status]}</Badge>
            {me.note && <p className="mt-2 text-xs text-muted-foreground">{me.note}</p>}
          </>
        ) : (
          <div className="text-xs text-muted-foreground">Not yet marked by a coach.</div>
        )}
      </Card>
    );
  }

  const counts = {
    present: attendance.filter((a) => a.status === "present").length,
    absent: attendance.filter((a) => a.status === "absent").length,
    excused: attendance.filter((a) => a.status === "excused").length,
    injured: attendance.filter((a) => a.status === "injured").length,
  };

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="text-sm font-semibold mb-2">Attendance</div>
        <div className="grid grid-cols-2 gap-y-1 text-xs text-muted-foreground">
          <span><span className="font-semibold text-success">{counts.present}</span> present</span>
          <span><span className="font-semibold text-destructive">{counts.absent}</span> absent</span>
          <span><span className="font-semibold text-warning">{counts.excused}</span> excused</span>
          <span><span className="font-semibold text-warning">{counts.injured}</span> injured</span>
        </div>
      </Card>

      {list.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground text-center">
          No members to mark yet.
        </Card>
      ) : list.map((m) => {
        const row = attendance.find((a) => a.user_id === m.user_id);
        const cur = row?.status ?? null;
        return (
          <Card key={m.user_id} className="p-3">
            <div className="text-sm font-medium mb-2">{nameOf(m.user_id)}</div>
            <div className="grid grid-cols-2 gap-2">
              {(["present", "absent", "excused", "injured"] as const).map((s) => (
                <Button
                  key={s} size="sm" variant={cur === s ? "default" : "outline"}
                  onClick={() => mark(m.user_id, s)} className="h-9"
                >
                  {ATT_LABELS[s]}
                </Button>
              ))}
            </div>
            <Input
              className="mt-2 h-8 text-xs"
              placeholder="Note (optional)"
              defaultValue={row?.note ?? ""}
              onBlur={(e) => {
                if ((e.target.value.trim() || null) !== (row?.note ?? null)) {
                  saveNote(m.user_id, e.target.value);
                }
              }}
            />
          </Card>
        );
      })}
    </div>
  );
}


/* --------------------------- Equipment checklist --------------------------- */

type ChecklistRow = {
  id: string;
  equipment_id: string;
  checked: boolean;
  notes: string | null;
  equipment: { id: string; name: string; category: string | null } | null;
};

function ChecklistPanel({ sessionId, clubId, canManage }: {
  sessionId: string; clubId: string; canManage: boolean;
}) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [rows, setRows] = useState<ChecklistRow[]>([]);
  const [available, setAvailable] = useState<{ id: string; name: string; category: string | null }[]>([]);
  const [selected, setSelected] = useState<string>("");

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("session_equipment")
      .select("id, equipment_id, checked, notes, equipment:equipment(id, name, category)")
      .eq("session_id", sessionId);
    setRows((data ?? []) as unknown as ChecklistRow[]);
    const { data: eq } = await supabase
      .from("equipment").select("id, name, category")
      .eq("club_id", clubId).eq("status", "active").order("name");
    setAvailable(eq ?? []);
  }, [sessionId, clubId]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (row: ChecklistRow) => {
    const next = !row.checked;
    const { error } = await supabase.from("session_equipment").update({
      checked: next,
      checked_by: next ? user?.id ?? null : null,
      checked_at: next ? new Date().toISOString() : null,
    }).eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const addItem = async () => {
    if (!selected) return;
    const { error } = await supabase.from("session_equipment").insert({
      session_id: sessionId, equipment_id: selected,
    });
    if (error) { toast.error(error.message); return; }
    setSelected("");
    load();
  };

  const remove = async (id: string) => {
    const row = rows.find((r) => r.id === id);
    const name = row?.equipment?.name ?? "this item";
    const ok = await confirm({
      title: `Remove ${name}?`,
      description: "It will be taken off this session's checklist. The equipment itself isn't deleted.",
      confirmText: "Remove",
    });
    if (!ok) return;
    const { error } = await supabase.from("session_equipment").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removed from checklist");
    load();
  };


  const saveNote = async (id: string, notes: string) => {
    const { error } = await supabase.from("session_equipment").update({ notes: notes || null }).eq("id", id);
    if (error) toast.error(error.message); else load();
  };

  const existingIds = new Set(rows.map((r) => r.equipment_id));
  const selectable = available.filter((e) => !existingIds.has(e.id));

  return (
    <div className="space-y-3">
      {canManage && (
        <Card className="p-3">
          <div className="text-sm font-semibold mb-2">Add equipment</div>
          {available.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              No equipment in club yet. <Link to="/equipment" className="text-accent underline">Add gear</Link>.
            </div>
          ) : selectable.length === 0 ? (
            <div className="text-xs text-muted-foreground">All active equipment already added.</div>
          ) : (
            <div className="flex gap-2">
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Select item…" /></SelectTrigger>
                <SelectContent>
                  {selectable.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}{e.category ? ` · ${e.category}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={addItem} disabled={!selected}>Add</Button>
            </div>
          )}
        </Card>
      )}

      {rows.length === 0 ? (
        <Card className="p-4 text-center text-sm text-muted-foreground">
          No checklist items yet.
        </Card>
      ) : rows.map((r) => (
        <Card key={r.id} className="p-3">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => toggle(r)}
              className={`mt-0.5 h-6 w-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                r.checked ? "bg-success border-success text-white" : "border-muted-foreground/40"
              }`}
              aria-label={r.checked ? "Uncheck" : "Check"}
            >
              {r.checked && <span className="text-xs">✓</span>}
            </button>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium ${r.checked ? "line-through text-muted-foreground" : ""}`}>
                {r.equipment?.name || "Item"}
              </div>
              {r.equipment?.category && (
                <div className="text-[11px] text-muted-foreground">{r.equipment.category}</div>
              )}
              {canManage ? (
                <Input
                  className="mt-2 h-8 text-xs"
                  placeholder="Notes (e.g. low fuel)"
                  defaultValue={r.notes ?? ""}
                  onBlur={(e) => { if ((e.target.value || null) !== r.notes) saveNote(r.id, e.target.value); }}
                />
              ) : r.notes ? (
                <div className="mt-1 text-xs text-muted-foreground">{r.notes}</div>
              ) : null}
            </div>
            {canManage && (
              <Button size="icon" variant="ghost" onClick={() => remove(r.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
