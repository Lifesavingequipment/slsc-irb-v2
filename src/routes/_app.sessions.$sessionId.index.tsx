import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCanManage, useIsAdmin, useIsGuardian, useClub } from "@/lib/club-context";
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
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Calendar, MapPin, ExternalLink, ChevronLeft, Users, Trash2, Clock, Plus, Share2, Lock, Pencil, RotateCw, Info,
} from "lucide-react";
import { toast } from "sonner";
import { WavePanel } from "@/components/session/WavePanel";
import { CarpoolPanel } from "@/components/session/CarpoolPanel";
import { SurveyEditor, SurveyRunner, SurveyResults, usePretrainingSurveyStatus } from "@/components/session/SurveyPanel";
import { TrainingPlanView, TrainingPlanEditor } from "@/components/session/TrainingPlanPanel";
import { GearChecklistPanel } from "@/components/session/GearChecklistPanel";
import { RsvpManagerPanel } from "@/components/session/RsvpManagerPanel";
import { AttendancePanel as NewAttendancePanel } from "@/components/session/AttendancePanel";
import { useWeatherTidesData, degreesToCompass } from "@/components/session/WeatherTidesCard";
import { useCoachPermissions } from "@/lib/coach-permissions";
import { buildNameMap, memberFullName } from "@/lib/names";
import { invalidateSessionsCache, removeSessionFromCache } from "./_app.sessions.index";
import { SessionDetailSkeleton } from "@/components/ui/page-skeleton";
import { showToast } from "@/lib/toast";

const SESSION_TABS = ["rsvp", "plan", "survey", "waves", "gear", "carpool", "attendance"] as const;
type SessionTab = (typeof SESSION_TABS)[number];

export const Route = createFileRoute("/_app/sessions/$sessionId/")({
  head: () => ({ meta: [{ title: "Session — IRB Coaching" }] }),
  validateSearch: (search: Record<string, unknown>): { tab?: SessionTab } => {
    const tab = search.tab;
    return typeof tab === "string" && (SESSION_TABS as readonly string[]).includes(tab)
      ? { tab: tab as SessionTab }
      : {};
  },
  component: SessionDetail,
});

type Session = {
  id: string; club_id: string; title: string; session_type: string;
  location: string | null; starts_at: string; ends_at: string | null;
  rsvp_deadline: string | null;
  capacity: number | null; notes: string | null;
  survey_enabled: boolean; carpool_enabled: boolean;
  equipment_list_id: string | null;
  patients_enabled: boolean;
};

type RsvpStatus = "going" | "maybe" | "not_going";
type AttStatus = "present" | "late" | "excused" | "absent" | "injured";

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
  present: "Present", late: "Late", excused: "Excused", absent: "Absent", injured: "Injured",
};


function SessionDetail() {
  const { sessionId } = Route.useParams();
  const { tab: initialTab } = Route.useSearch();
  const { user } = useAuth();
  const { activeClub } = useClub();
  const canManage = useCanManage();
  const isAdmin = useIsAdmin();
  const isGuardian = useIsGuardian();
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
  const weatherData = useWeatherTidesData({
    sessionId,
    startsAt: session?.starts_at ?? new Date().toISOString(),
  });

  const handleShare = async () => {
    if (!session) return;
    const text = [
      session.title,
      format(new Date(session.starts_at), "EEEE d MMM yyyy · h:mma"),
      session.location ?? "",
    ].filter(Boolean).join("\n");
    if (navigator.share) {
      try { await navigator.share({ title: session.title, text }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    }
  };

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
      const [{ data: memData }, { data: memberships }, { data: guardians }] = await Promise.all([
        supabase
          .from("members")
          .select("id, auth_user_id, first_name, last_name, preferred_name, driver_flag, crew_flag, membership_status")
          .eq("club_id", session.club_id)
          .order("first_name"),
        supabase.from("club_memberships").select("user_id, status").eq("club_id", session.club_id),
        supabase.from("club_roles").select("user_id").eq("club_id", session.club_id).eq("role", "guardian"),
      ]);
      // club_memberships.status is the source of truth for approval; members.membership_status
      // is a denormalized copy that can drift out of sync, so fall back to it only when there's
      // no membership row for this club.
      const guardianUserIds = new Set((guardians ?? []).map((g) => g.user_id));
      const statusByUserId = new Map((memberships ?? []).map((x) => [x.user_id, x.status]));
      const activeMembers = (memData ?? []).filter((m) => {
        if (m.auth_user_id && guardianUserIds.has(m.auth_user_id)) return false;
        const status = (m.auth_user_id && statusByUserId.get(m.auth_user_id)) ?? m.membership_status;
        return status === "approved" || status === "active" || status === "pending";
      });
      const list: Member[] = activeMembers.map((m) => ({
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

  const rsvpOpensAt = useMemo(() => {
    if (!session?.starts_at) return null;
    return new Date(new Date(session.starts_at).getTime() - 7 * 24 * 60 * 60 * 1000);
  }, [session?.starts_at]);

  const rsvpTooEarly = useMemo(() => {
    if (!rsvpOpensAt) return false;
    return rsvpOpensAt.getTime() > Date.now();
  }, [rsvpOpensAt]);

  const rsvp = async (status: RsvpStatus) => {
    if (!user || rsvpClosed || rsvpTooEarly) return;
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
          member_id: existing?.member_id ?? null,
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
      if (error.message?.includes("RSVP_TOO_EARLY")) {
        toast.error("RSVPs open 7 days before the session.");
      } else {
        toast.error(error.message);
      }
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
      const prevStatus = prev.find((r) => r.user_id === user.id)?.status ?? null;
      showToast.withUndo(
        `RSVP updated — ${STATUS_LABELS[status]}`,
        async () => {
          if (prevStatus) {
            await supabase.from("session_rsvps").upsert(
              { session_id: sessionId, user_id: user.id, status: prevStatus },
              { onConflict: "session_id,user_id" },
            );
          } else {
            await supabase.from("session_rsvps")
              .delete().eq("session_id", sessionId).eq("user_id", user.id);
          }
          await load();
        },
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
          member_id: existing?.member_id ?? null,
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
          member_id: member?.id ?? null,
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
    return <AppShell><SessionDetailSkeleton /></AppShell>;
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

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <Badge variant="secondary" className="text-[10px] uppercase">{session.session_type}</Badge>
          {canManage && (
            <Button asChild variant="ghost" size="icon" className="h-9 w-9 -mr-1">
              <Link to="/sessions/$sessionId/edit" params={{ sessionId }}>
                <Pencil className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>

        <h1 className="mt-1.5 text-xl font-bold">{session.title}</h1>

        <div className="mt-2 space-y-1 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {format(new Date(session.starts_at), "EEEE d MMM yyyy · h:mma")}
            {session.ends_at && <>– {format(new Date(session.ends_at), "h:mma")}</>}
          </div>
          {session.location && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(session.location)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 hover:text-blue-500 transition-colors"
                >
                  {session.location.split(" — ")[0]}
                  <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                </a>
                {session.location.includes(" — ") && (
                  <div>
                    <span className="text-xs text-muted-foreground">{session.location.split(" — ")[1]}</span>
                  </div>
                )}
              </div>
            </div>
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

        {session.notes && <p className="mt-3 text-sm whitespace-pre-wrap">{session.notes}</p>}

        {!weatherData.loading && (weatherData.weather || (!weatherData.tooFarForWaves && weatherData.waves) || (weatherData.tides && weatherData.tides.length > 0)) && (
          <div className="mt-3 pt-3 border-t space-y-1 text-sm text-muted-foreground">
            {!weatherData.tooFarForWeather && weatherData.weather && (
              <div className="flex items-center gap-1">
                <span>
                  {weatherData.weather.emoji} {weatherData.weather.label} · {weatherData.weather.maxTemp}°C · {weatherData.weather.windDir} {weatherData.weather.windSpeed} km/h
                  {weatherData.weather.uvIndex != null ? ` · UV ${weatherData.weather.uvIndex}` : ""}
                </span>
                {weatherData.weatherUpdatedAt && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Weather last updated time"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-2 text-xs" align="start">
                      Updated {formatDistanceToNow(new Date(weatherData.weatherUpdatedAt), { addSuffix: true })}
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            )}
            {!weatherData.tooFarForWaves && weatherData.waves && (
              <div className="flex items-center gap-1">
                <span>
                  🌊 Surf:{" "}
                  {weatherData.waves.heightMax != null
                    ? `~${Math.round(weatherData.waves.heightMax * 10) / 10}m`
                    : "Approx. surf — coastal data unavailable"}
                  {weatherData.waves.periodMax != null ? ` · ${Math.round(weatherData.waves.periodMax)}s period` : ""}
                  {weatherData.waves.directionDominant != null ? ` · ${degreesToCompass(weatherData.waves.directionDominant)}` : ""}
                  {weatherData.waves.approx ? " (approx.)" : ""}
                </span>
                {weatherData.weatherUpdatedAt && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Surf data last updated time"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-2 text-xs" align="start">
                      Updated {formatDistanceToNow(new Date(weatherData.weatherUpdatedAt), { addSuffix: true })}
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            )}
            {weatherData.tides && weatherData.tides.length > 0 && (
              <div className="flex flex-col gap-0.5">
                {(["High", "Low"] as const).map((type) => {
                  const entries = weatherData.tides!.filter((t) => t.type === type);
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
        )}

        <div className="mt-3 flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9 text-sm" onClick={handleShare}>
            <Share2 className="h-3.5 w-3.5 mr-1.5" /> Share
          </Button>
          {rsvpClosed && (
            <Badge variant="outline" className="gap-1 ml-auto"><Lock className="h-3 w-3" /> RSVP closed</Badge>
          )}
        </div>
      </Card>

      <Tabs defaultValue={initialTab ?? "rsvp"} className="mt-4">
        <div className="relative">
          <TabsList className="flex overflow-x-auto scrollbar-hide w-full h-auto justify-start">
            <TabsTrigger value="rsvp" className="text-xs flex-shrink-0 min-h-[40px] px-3">RSVPs</TabsTrigger>
            <TabsTrigger value="plan" className="text-xs flex-shrink-0 min-h-[40px] px-3">Plan</TabsTrigger>
            {session.survey_enabled && <TabsTrigger value="survey" className="text-xs flex-shrink-0 min-h-[40px] px-3">Survey</TabsTrigger>}
            <TabsTrigger value="waves" className="text-xs flex-shrink-0 min-h-[40px] px-3">Waves</TabsTrigger>
            <TabsTrigger value="gear" className="text-xs flex-shrink-0 min-h-[40px] px-3">Gear</TabsTrigger>
            {(session.carpool_enabled || canManage) && <TabsTrigger value="carpool" className="text-xs flex-shrink-0 min-h-[40px] px-3">Carpool</TabsTrigger>}
            <TabsTrigger value="attendance" className="text-xs flex-shrink-0 min-h-[40px] px-3">Attend</TabsTrigger>
          </TabsList>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-muted to-transparent" />
        </div>

        <TabsContent value="rsvp" className="space-y-4 mt-4">

          {!isGuardian && session.survey_enabled && surveyStatus.required && !surveyStatus.complete && !canManage && user && (
            <SurveyRunner
              sessionId={sessionId}
              clubId={session.club_id}
              userId={user.id}
              onComplete={surveyStatus.refresh}
            />
          )}

          {!isGuardian && (
            <Card className="p-4">
              <div className="text-sm font-semibold mb-3">Your response</div>
              <div className="grid grid-cols-3 gap-2">
                {(["going", "maybe", "not_going"] as const).map((s) => {
                  const blocked = session.survey_enabled && surveyStatus.required && !surveyStatus.complete && !canManage;
                  return (
                    <Button
                      key={s}
                      variant={myRsvp === s ? "default" : "outline"}
                      disabled={busy || rsvpClosed || blocked || rsvpTooEarly}
                      onClick={() => rsvp(s)}
                      className="h-11"
                      title={rsvpTooEarly && rsvpOpensAt ? `RSVP opens ${format(rsvpOpensAt, "d MMM")}` : undefined}
                    >
                      {STATUS_LABELS[s]}
                    </Button>
                  );
                })}
              </div>
              {rsvpClosed && (
                <p className="mt-2 text-xs text-muted-foreground">The RSVP deadline has passed.</p>
              )}
              {!rsvpClosed && rsvpTooEarly && rsvpOpensAt && (
                <p className="mt-2 text-xs text-muted-foreground">RSVP opens {format(rsvpOpensAt, "d MMM")}.</p>
              )}
              {session.survey_enabled && surveyStatus.required && !surveyStatus.complete && !canManage && (
                <p className="mt-2 text-xs text-warning">Complete the pre-training survey above before you can RSVP.</p>
              )}
            </Card>
          )}

          <RsvpManagerPanel
            sessionId={sessionId}
            rsvps={rsvps}
            setRsvps={setRsvps}
            members={sortedMembers}
            canManage={canManage}
            nameOf={dn}
            onChange={() => load()}
          />
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

        {(session.carpool_enabled || canManage) && (
          <TabsContent value="carpool" className="space-y-4 mt-4">
            {!session.carpool_enabled && canManage && (
              <Badge variant="outline" className="text-[10px]">Carpool off</Badge>
            )}
            <CarpoolPanel sessionId={sessionId} />
          </TabsContent>
        )}

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
            ) : user && !isGuardian ? (
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
          <GearChecklistPanel
            sessionId={sessionId}
            clubId={session.club_id}
            canManage={canManage}
            equipmentListId={session.equipment_list_id}
            onListChange={(listId) => setSession((s) => (s ? { ...s, equipment_list_id: listId } : s))}
          />
        </TabsContent>

        <TabsContent value="attendance" className="space-y-4 mt-4">
          <NewAttendancePanel
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

