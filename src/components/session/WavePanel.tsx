import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/lib/confirm";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Lock, Share2, Shuffle, Trash2, Users, ChevronDown, ChevronUp, AlertTriangle,
  Car, UserCheck, HeartPulse, Scale, GripVertical, X,
} from "lucide-react";
import { showToast } from "@/lib/toast";
import { format } from "date-fns";
import { buildNameMap, memberFullName } from "@/lib/names";
import { notifyMembers } from "@/lib/notify";

type Props = {
  sessionId: string;
  clubId: string;
  sessionTitle: string;
  sessionStartsAt: string;
  goingIds: string[];
  canManage: boolean;
};

type Team = {
  id: string;
  driver_id: string | null;
  crew_id: string | null;
  patient_id: string | null;
  wave: number | null;
  lane: number | null;
  notes: string | null;
};
type Partner = { driver_id: string; crew_id: string };
type Member = {
  id: string;
  display_name: string;
  auth_user_id: string | null;
  driver_flag: boolean;
  crew_flag: boolean;
  patient_flag: boolean;
};
type Cfg = { waves_count: number; lanes_count: number };
type Role = "driver" | "crew" | "patient";

const MAX_LANES = 10;

const ROLE_CONFIG: Record<Role, { label: string; icon: typeof Car; chip: string }> = {
  driver: { label: "Driver", icon: Car, chip: "bg-blue-100 text-blue-800 border-blue-200" },
  crew: { label: "Crew", icon: UserCheck, chip: "bg-green-100 text-green-800 border-green-200" },
  patient: { label: "Patient", icon: HeartPulse, chip: "bg-purple-100 text-purple-800 border-purple-200" },
};

function computeLayouts(teamCount: number, maxLanes: number) {
  if (teamCount === 0) return [];
  const options: { waves: number; lanes: number; empty: number }[] = [];
  for (let l = 1; l <= maxLanes; l++) {
    const waves = Math.ceil(teamCount / l);
    const slots = waves * l;
    const empty = slots - teamCount;
    options.push({ waves, lanes: l, empty });
  }
  const good = options.filter((o) => o.empty <= 4);
  if (good.length === 0) {
    const best = options.reduce((a, b) => (a.empty <= b.empty ? a : b));
    return [best];
  }
  return good.sort((a, b) => a.waves - b.waves || a.empty - b.empty);
}

type DragSource =
  | { kind: "pool"; memberId: string }
  | { kind: "slot"; teamId: string; role: Role };

/** Build a properly-typed Supabase patch for a single role column. */
function rolePatch(role: Role, value: string | null): { driver_id?: string | null; crew_id?: string | null; patient_id?: string | null } {
  if (role === "driver") return { driver_id: value };
  if (role === "crew") return { crew_id: value };
  return { patient_id: value };
}

export function WavePanel({
  sessionId, clubId, sessionTitle, sessionStartsAt, goingIds, canManage,
}: Props) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [members, setMembers] = useState<Record<string, Member>>({});
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [lanes, setLanes] = useState(() => {
    try {
      const s = localStorage.getItem("slsc-irb-lanes");
      return s ? Math.max(1, Math.min(10, Number(s))) : 4;
    } catch {
      return 4;
    }
  });
  const [busy, setBusy] = useState(false);
  const [collapsedWaves, setCollapsedWaves] = useState<Set<number>>(new Set());
  const [dragSource, setDragSource] = useState<DragSource | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    const [{ data: t }, { data: p }, { data: c }, { data: profs }] = await Promise.all([
      supabase.from("session_teams").select("*").eq("session_id", sessionId),
      supabase.from("member_partners").select("driver_id, crew_id").eq("club_id", clubId),
      supabase.from("session_draw_configs").select("waves_count, lanes_count").eq("session_id", sessionId).maybeSingle(),
      goingIds.length
        ? supabase.from("members").select("id, auth_user_id, first_name, last_name, preferred_name, driver_flag, crew_flag, patient_flag").in("id", goingIds).eq("club_id", clubId)
        : Promise.resolve({ data: [] as { id: string; auth_user_id: string | null; first_name: string | null; last_name: string | null; preferred_name: string | null; driver_flag: boolean | null; crew_flag: boolean | null; patient_flag: boolean | null }[] }),
    ]);
    setTeams((t ?? []) as Team[]);
    setPartners((p ?? []) as Partner[]);
    setCfg((c as Cfg | null) ?? null);
    const map: Record<string, Member> = {};
    (profs ?? []).forEach((m) => {
      map[m.id] = {
        id: m.id,
        auth_user_id: m.auth_user_id ?? null,
        display_name: memberFullName(m, "Member"),
        driver_flag: m.driver_flag ?? false,
        crew_flag: m.crew_flag ?? false,
        patient_flag: m.patient_flag ?? false,
      };
    });
    setMembers(map);
  }, [sessionId, clubId, goingIds]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (cfg?.lanes_count) setLanes(cfg.lanes_count); }, [cfg?.lanes_count]);

  const displayMap = useMemo(
    () => buildNameMap(Object.values(members).map((m) => ({ id: m.id, full_name: m.display_name }))),
    [members],
  );
  const dn = (id: string | null | undefined) => (id && displayMap[id]) || "—";

  const goingSet = useMemo(() => new Set(goingIds), [goingIds]);
  const authToMemberId = useMemo(() => {
    const m: Record<string, string> = {};
    Object.values(members).forEach((mem) => { if (mem.auth_user_id) m[mem.auth_user_id] = mem.id; });
    return m;
  }, [members]);

  const memberSlotCount = useMemo(() => {
    const counts: Record<string, number> = {};
    teams.forEach((t) => {
      if (t.driver_id) counts[t.driver_id] = (counts[t.driver_id] ?? 0) + 1;
      if (t.crew_id) counts[t.crew_id] = (counts[t.crew_id] ?? 0) + 1;
      if (t.patient_id) counts[t.patient_id] = (counts[t.patient_id] ?? 0) + 1;
    });
    return counts;
  }, [teams]);

  const assignedIds = useMemo(() => {
    const s = new Set<string>();
    teams.forEach((t) => {
      if (t.driver_id) s.add(t.driver_id);
      if (t.crew_id) s.add(t.crew_id);
      if (t.patient_id) s.add(t.patient_id);
    });
    return s;
  }, [teams]);

  const unassigned = useMemo(
    () => goingIds
      .filter((id) => !assignedIds.has(id))
      .map((id) => members[id])
      .filter(Boolean)
      .slice()
      .sort((a, b) => dn(a.id).localeCompare(dn(b.id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goingIds, assignedIds, members, displayMap],
  );

  const confirmedDrivers = useMemo(() => goingIds.filter((id) => members[id]?.driver_flag), [goingIds, members]);
  const confirmedCrew = useMemo(() => goingIds.filter((id) => members[id]?.crew_flag), [goingIds, members]);
  const confirmedPatients = useMemo(() => goingIds.filter((id) => members[id]?.patient_flag), [goingIds, members]);

  const placedTeams = useMemo(() => teams.filter((t) => t.wave != null && t.lane != null), [teams]);
  const benchTeams = useMemo(() => teams.filter((t) => t.wave == null || t.lane == null), [teams]);

  const teamLabel = (t: Team) => {
    const parts = [t.driver_id && dn(t.driver_id), t.crew_id && dn(t.crew_id), t.patient_id && dn(t.patient_id)]
      .filter(Boolean) as string[];
    return parts.length ? parts.join(" + ") : "Empty";
  };

  const duplicateIds = useMemo(() => {
    const dupes = new Set<string>();
    Object.entries(memberSlotCount).forEach(([id, count]) => { if (count > 1) dupes.add(id); });
    return dupes;
  }, [memberSlotCount]);

  const placeMember = async (memberId: string, targetTeamId: string, role: Role) => {
    setBusy(true);
    const { error } = await supabase.from("session_teams").update(rolePatch(role, memberId)).eq("id", targetTeamId);
    setBusy(false);
    if (error) { showToast.error(error.message); return; }
    load();
  };

  const createTeamWith = async (memberId: string, role: Role, wave: number | null = null, lane: number | null = null) => {
    setBusy(true);
    const { error } = await supabase.from("session_teams")
      .insert({ session_id: sessionId, wave, lane, ...rolePatch(role, memberId) });
    setBusy(false);
    if (error) { showToast.error(error.message); return; }
    load();
  };

  const clearSlot = async (teamId: string, role: Role) => {
    setBusy(true);
    const { error } = await supabase.from("session_teams")
      .update(rolePatch(role, null)).eq("id", teamId);
    setBusy(false);
    if (error) { showToast.error(error.message); return; }
    load();
  };

  const removeTeam = async (id: string) => {
    const t = teams.find((x) => x.id === id);
    const label = t ? teamLabel(t) : "this team";
    const ok = await confirm({
      title: "Remove team?",
      description: `${label} will be removed from this session's wave draw.`,
      confirmText: "Remove",
    });
    if (!ok) return;
    const { error } = await supabase.from("session_teams").delete().eq("id", id);
    if (error) { showToast.error(error.message); return; }
    showToast.success("Team removed");
    load();
  };

  const clearAll = async () => {
    const ok = await confirm({
      title: "Clear all waves?",
      description: "Every team and lane assignment for this session will be removed. This can't be undone.",
      confirmText: "Clear all",
    });
    if (!ok) return;
    const { error } = await supabase.from("session_teams").delete().eq("session_id", sessionId);
    if (error) { showToast.error(error.message); return; }
    showToast.success("Waves cleared");
    load();
  };

  const setConfig = async (waves: number, lanesCount: number) => {
    setBusy(true);
    const { error } = await supabase.from("session_draw_configs")
      .upsert({ session_id: sessionId, waves_count: waves, lanes_count: lanesCount }, { onConflict: "session_id" });
    setBusy(false);
    if (error) { showToast.error(error.message); return; }
    setCfg({ waves_count: waves, lanes_count: lanesCount });
    showToast.success(`${waves} waves × ${lanesCount} lanes set`);
  };

  const autoPairBlockers = useMemo(() => {
    const reasons: string[] = [];
    if (goingIds.length === 0) reasons.push("No confirmed members yet — wait for RSVPs before drawing waves.");
    const availableDrivers = confirmedDrivers.filter((id) => !assignedIds.has(id));
    const availableCrew = confirmedCrew.filter((id) => !assignedIds.has(id));
    if (availableDrivers.length === 0 && availableCrew.length === 0 && unassigned.length > 0) {
      reasons.push("No one going has a Driver or Crew role set — check member profiles, or drag people in manually.");
    }
    return reasons;
  }, [goingIds, confirmedDrivers, confirmedCrew, assignedIds, unassigned]);

  const autoPair = async () => {
    if (unassigned.length === 0) {
      showToast.info("Everyone confirmed is already placed in a team.");
      return;
    }
    setBusy(true);
    const used = new Set<string>(assignedIds);
    const inserts: { session_id: string; driver_id: string | null; crew_id: string | null; patient_id: string | null }[] = [];

    for (const p of partners) {
      const driverId = authToMemberId[p.driver_id] ?? p.driver_id;
      const crewId = authToMemberId[p.crew_id] ?? p.crew_id;
      if (used.has(driverId) || used.has(crewId)) continue;
      if (!goingSet.has(driverId) || !goingSet.has(crewId)) continue;
      inserts.push({ session_id: sessionId, driver_id: driverId, crew_id: crewId, patient_id: null });
      used.add(driverId);
      used.add(crewId);
    }

    const remaining = goingIds.filter((id) => !used.has(id));
    const bothFlags = remaining.filter((id) => members[id]?.driver_flag && members[id]?.crew_flag);
    const driversOnly = remaining.filter((id) => members[id]?.driver_flag && !members[id]?.crew_flag);
    const crewOnly = remaining.filter((id) => !members[id]?.driver_flag && members[id]?.crew_flag);
    const neither = remaining.filter((id) => id in members && !members[id]?.driver_flag && !members[id]?.crew_flag && !members[id]?.patient_flag);
    const patientsOnly = remaining.filter((id) => members[id]?.patient_flag && !members[id]?.driver_flag && !members[id]?.crew_flag);

    const driverPool = [...driversOnly, ...bothFlags];
    const usedAsDual = new Set<string>();
    const availableCrew = () => [
      ...crewOnly.filter((id) => !used.has(id)),
      ...bothFlags.filter((id) => !used.has(id) && !usedAsDual.has(id)),
    ];

    for (const driverId of driverPool) {
      if (used.has(driverId)) continue;
      const crewList = availableCrew();
      if (crewList.length === 0) {
        inserts.push({ session_id: sessionId, driver_id: driverId, crew_id: null, patient_id: null });
        used.add(driverId);
        if (bothFlags.includes(driverId)) usedAsDual.add(driverId);
        continue;
      }
      const crewId = crewList[0];
      inserts.push({ session_id: sessionId, driver_id: driverId, crew_id: crewId, patient_id: null });
      used.add(driverId);
      used.add(crewId);
      if (bothFlags.includes(driverId)) usedAsDual.add(driverId);
    }

    for (const crewId of crewOnly) {
      if (used.has(crewId)) continue;
      inserts.push({ session_id: sessionId, driver_id: null, crew_id: crewId, patient_id: null });
      used.add(crewId);
    }

    const neitherPool = neither.filter((id) => !used.has(id));
    for (let i = 0; i + 1 < neitherPool.length; i += 2) {
      inserts.push({ session_id: sessionId, driver_id: neitherPool[i], crew_id: neitherPool[i + 1], patient_id: null });
      used.add(neitherPool[i]); used.add(neitherPool[i + 1]);
    }
    if (neitherPool.length % 2 === 1) {
      const last = neitherPool[neitherPool.length - 1];
      inserts.push({ session_id: sessionId, driver_id: last, crew_id: null, patient_id: null });
      used.add(last);
    }

    const teamsNeedingPatient = inserts.filter((t) => t.driver_id && t.crew_id && !t.patient_id);
    let pi = 0;
    for (const t of teamsNeedingPatient) {
      if (pi >= patientsOnly.length) break;
      t.patient_id = patientsOnly[pi];
      used.add(patientsOnly[pi]);
      pi++;
    }
    for (; pi < patientsOnly.length; pi++) {
      if (used.has(patientsOnly[pi])) continue;
      inserts.push({ session_id: sessionId, driver_id: null, crew_id: null, patient_id: patientsOnly[pi] });
      used.add(patientsOnly[pi]);
    }

    const safeInserts = inserts.filter((row) =>
      (row.driver_id == null || row.driver_id in members) &&
      (row.crew_id == null || row.crew_id in members) &&
      (row.patient_id == null || row.patient_id in members) &&
      (row.driver_id || row.crew_id || row.patient_id),
    );

    if (!safeInserts.length) {
      setBusy(false);
      showToast.error("Couldn't auto-pair — no eligible members found. Check role flags on member profiles.");
      return;
    }
    const { error } = await supabase.from("session_teams").insert(safeInserts);
    setBusy(false);
    if (error) { showToast.error(error.message); return; }
    showToast.success(`Auto-paired ${safeInserts.length} team${safeInserts.length === 1 ? "" : "s"}`);
    load();
  };

  const autoBalance = async () => {
    if (!cfg) {
      showToast.error("Set a wave layout first — choose waves × lanes below.");
      return;
    }
    if (teams.length === 0) {
      showToast.error("No teams to balance yet — auto-pair or create teams first.");
      return;
    }
    setBusy(true);
    const slots: { wave: number; lane: number }[] = [];
    for (let w = 1; w <= cfg.waves_count; w++) {
      for (let l = 1; l <= cfg.lanes_count; l++) slots.push({ wave: w, lane: l });
    }
    const ordered = [...teams].sort((a, b) => teamLabel(a).localeCompare(teamLabel(b)));
    const updates = ordered.slice(0, slots.length).map((t, i) => ({ id: t.id, wave: slots[i].wave, lane: slots[i].lane }));
    const overflow = ordered.slice(slots.length).map((t) => ({ id: t.id, wave: null, lane: null }));
    const all = [...updates, ...overflow];

    for (const u of all) {
      const { error } = await supabase.from("session_teams").update({ wave: u.wave, lane: u.lane }).eq("id", u.id);
      if (error) { setBusy(false); showToast.error(error.message); return; }
    }
    setBusy(false);
    showToast.success("Waves auto-balanced");
    load();
  };

  const shareDraw = async () => {
    const lines: string[] = [];
    lines.push(`🚤 ${sessionTitle}`);
    lines.push(format(new Date(sessionStartsAt), "EEE d MMM yyyy, h:mm a"));
    lines.push("");
    if (cfg) {
      lines.push(`${cfg.waves_count} waves × ${cfg.lanes_count} lanes — ${placedTeams.length} placed`);
      for (let w = 1; w <= cfg.waves_count; w++) {
        lines.push("");
        lines.push(`Wave ${w}`);
        for (let l = 1; l <= cfg.lanes_count; l++) {
          const t = teams.find((x) => x.wave === w && x.lane === l);
          lines.push(`  Lane ${l}: ${t ? teamLabel(t) : "—"}`);
        }
      }
      if (benchTeams.length) {
        lines.push("");
        lines.push("Bench");
        benchTeams.forEach((t) => lines.push(`  • ${teamLabel(t)}`));
      }
    } else {
      lines.push(`${teams.length} team${teams.length === 1 ? "" : "s"} (no wave layout set)`);
      teams.forEach((t) => lines.push(`  • ${teamLabel(t)}`));
    }
    if (unassigned.length) {
      lines.push("");
      lines.push(`⚠ Unassigned: ${unassigned.map((m) => dn(m.id)).join(", ")}`);
    }
    const text = lines.join("\n");
    try {
      if (navigator.share) await navigator.share({ text, title: sessionTitle });
      else { await navigator.clipboard.writeText(text); showToast.success("Copied to clipboard"); }
    } catch { /* user cancelled */ }

    if (canManage && goingIds.length > 0) {
      void notifyMembers(goingIds, {
        club_id: clubId,
        notification_type: "wave_draw_published",
        message: `Wave draw ready: ${sessionTitle}`,
        related_id: sessionId,
      });
    }
  };

  const onDropToSlot = (targetTeamId: string | null, role: Role, wave: number | null, lane: number | null) => {
    if (!dragSource || busy) return;
    setDragOverKey(null);
    if (dragSource.kind === "pool") {
      const memberId = dragSource.memberId;
      if (targetTeamId) {
        placeMember(memberId, targetTeamId, role);
      } else {
        createTeamWith(memberId, role, wave, lane);
      }
    } else {
      const { teamId: sourceTeamId, role: sourceRole } = dragSource;
      const sourceTeam = teams.find((t) => t.id === sourceTeamId);
      if (!sourceTeam) { setDragSource(null); return; }
      const memberId = sourceRole === "driver" ? sourceTeam.driver_id : sourceRole === "crew" ? sourceTeam.crew_id : sourceTeam.patient_id;
      if (!memberId) { setDragSource(null); return; }
      if (targetTeamId === sourceTeamId && role === sourceRole) { setDragSource(null); return; }
      setBusy(true);
      (async () => {
        await supabase.from("session_teams").update(rolePatch(sourceRole, null)).eq("id", sourceTeamId);
        if (targetTeamId) {
          await supabase.from("session_teams").update(rolePatch(role, memberId)).eq("id", targetTeamId);
        } else {
          await supabase.from("session_teams").insert({ session_id: sessionId, wave, lane, ...rolePatch(role, memberId) });
        }
        setBusy(false);
        load();
      })();
    }
    setDragSource(null);
  };

  if (!canManage) {
    return (
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Lock className="h-4 w-4" /> Wave Draw (view only)
        </div>
        {cfg && placedTeams.length > 0 ? (
          <ReadOnlyGrid cfg={cfg} teams={teams} nameOf={dn} memberSlotCount={memberSlotCount} duplicateIds={duplicateIds} />
        ) : (
          <p className="text-sm text-muted-foreground">No draw published yet.</p>
        )}
        {benchTeams.length > 0 && (
          <div className="pt-2 border-t space-y-1.5">
            <div className="text-xs font-semibold text-muted-foreground uppercase">Bench</div>
            {benchTeams.map((t) => (
              <div key={t.id} className="text-sm rounded-lg border p-2 bg-card">{teamLabel(t)}</div>
            ))}
          </div>
        )}
      </Card>
    );
  }

  const teamCount = teams.length > 0 ? teams.length : Math.ceil(goingIds.length / 2);
  const waveOptions = computeLayouts(teamCount, lanes);
  const estimatedTeams = Math.ceil(goingIds.length / 2);
  const displayLanes = cfg?.lanes_count ?? lanes;
  const displayMinWaves = teams.length > 0
    ? Math.max(1, Math.ceil(teams.length / displayLanes))
    : estimatedTeams > 0
    ? Math.max(1, Math.ceil(estimatedTeams / displayLanes))
    : 1;
  const displayWaves = cfg?.waves_count ?? displayMinWaves;
  const displayCfg: Cfg | null =
    goingIds.length > 0 || teams.length > 0
      ? { waves_count: displayWaves, lanes_count: displayLanes }
      : cfg ?? null;

  const toggleWaveCollapse = (w: number) => {
    setCollapsedWaves((prev) => {
      const next = new Set(prev);
      if (next.has(w)) next.delete(w); else next.add(w);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile icon={Users} label="Confirmed" value={goingIds.length} tone="default" />
        <StatTile icon={Car} label="Drivers" value={confirmedDrivers.length} tone="blue" />
        <StatTile icon={UserCheck} label="Crew" value={confirmedCrew.length} tone="green" />
        <StatTile icon={HeartPulse} label="Patients" value={confirmedPatients.length} tone="purple" />
      </div>

      {duplicateIds.size > 0 && (
        <Card className="p-3 border-amber-300 bg-amber-50">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800">
              <span className="font-semibold">{duplicateIds.size} member{duplicateIds.size === 1 ? "" : "s"} appear{duplicateIds.size === 1 ? "s" : ""} in multiple slots:</span>{" "}
              {Array.from(duplicateIds).map((id) => dn(id)).join(", ")}
            </div>
          </div>
        </Card>
      )}

      <Card className="p-3">
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={autoPair} disabled={busy} className="h-11">
            <Shuffle className="h-4 w-4 mr-1.5" />Auto Pair
          </Button>
          <Button onClick={autoBalance} disabled={busy || teams.length === 0} variant="secondary" className="h-11">
            <Scale className="h-4 w-4 mr-1.5" />Auto Balance
          </Button>
          <Button onClick={shareDraw} disabled={busy} variant="outline" className="h-11">
            <Share2 className="h-4 w-4 mr-1.5" />Share Waves
          </Button>
          <Button
            onClick={clearAll}
            disabled={busy || teams.length === 0}
            variant="outline"
            className="h-11 text-destructive border-destructive/30 hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4 mr-1.5" />Clear Waves
          </Button>
        </div>

        {autoPairBlockers.length > 0 && (
          <div className="mt-2.5 rounded-lg bg-muted/60 p-2.5 space-y-1">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Auto Pair needs:
            </div>
            {autoPairBlockers.map((reason, i) => (
              <div key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                <span className="text-amber-600 shrink-0">•</span>{reason}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-3">
        <button
          type="button"
          onClick={() => setConfigOpen((o) => !o)}
          className="w-full flex items-center justify-between"
        >
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Wave layout {cfg ? `— ${cfg.waves_count} × ${cfg.lanes_count}` : ""}
          </div>
          {configOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {configOpen && (
          <div className="space-y-4 mt-3">
            <div className="space-y-2">
              <div className="text-[11px] font-medium text-muted-foreground">Lanes available today</div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: MAX_LANES }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setLanes(n);
                      try { localStorage.setItem("slsc-irb-lanes", String(n)); } catch { /* ignore */ }
                    }}
                    className={[
                      "w-9 h-9 rounded-lg border text-sm font-semibold transition-colors",
                      lanes === n ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent/10 border-border",
                    ].join(" ")}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {teamCount > 0 ? (
              <div className="space-y-2">
                <div className="text-[11px] font-medium text-muted-foreground">Choose a layout</div>
                {waveOptions.map((opt, i) => {
                  const slots = opt.waves * opt.lanes;
                  const isSelected = cfg?.waves_count === opt.waves && cfg?.lanes_count === opt.lanes;
                  return (
                    <button
                      key={`${opt.waves}-${opt.lanes}`}
                      type="button"
                      disabled={busy}
                      onClick={() => setConfig(opt.waves, opt.lanes)}
                      className={[
                        "w-full rounded-xl border p-3 text-left transition-colors",
                        isSelected ? "bg-primary/10 border-primary" : "bg-card hover:bg-accent/10 border-border",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-base font-bold">{opt.waves} {opt.waves === 1 ? "wave" : "waves"} × {opt.lanes} {opt.lanes === 1 ? "lane" : "lanes"}</span>
                        {i === 0 && <span className="shrink-0 text-[10px] font-semibold text-amber-600">⭐ Recommended</span>}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {slots} slots · {opt.empty === 0 ? "perfect fit" : `${opt.empty} empty`}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">No members confirmed yet.</p>
            )}
          </div>
        )}
      </Card>

      {unassigned.length > 0 && (
        <Card className="p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-xs font-semibold uppercase tracking-wide">Unallocated ({unassigned.length})</span>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-1">Drag a member onto a wave slot, or onto Driver / Crew / Patient below.</p>
          <div className="grid grid-cols-2 gap-2">
            {unassigned.map((m) => (
              <PoolCard key={m.id} member={m} onDragStart={() => setDragSource({ kind: "pool", memberId: m.id })} />
            ))}
          </div>
        </Card>
      )}

      {displayCfg && (
        <div className="space-y-3">
          {Array.from({ length: displayCfg.waves_count }, (_, wi) => wi + 1).map((w) => {
            const isCollapsed = collapsedWaves.has(w);
            const waveTeams = teams.filter((t) => t.wave === w);
            const filledSlots = waveTeams.reduce((acc, t) => acc + (t.driver_id ? 1 : 0) + (t.crew_id ? 1 : 0) + (t.patient_id ? 1 : 0), 0);
            return (
              <Card key={w} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleWaveCollapse(w)}
                  className="w-full flex items-center justify-between p-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">Wave {w}</span>
                    <Badge variant="secondary" className="text-[10px] h-5">{filledSlots} placed</Badge>
                  </div>
                  {isCollapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                </button>
                {!isCollapsed && (
                  <div className="px-3 pb-3 space-y-2.5">
                    {Array.from({ length: displayCfg.lanes_count }, (_, li) => li + 1).map((l) => {
                      const t = teams.find((x) => x.wave === w && x.lane === l);
                      return (
                        <LaneCard
                          key={l}
                          lane={l}
                          team={t ?? null}
                          wave={w}
                          nameOf={dn}
                          memberSlotCount={memberSlotCount}
                          duplicateIds={duplicateIds}
                          dragOverKey={dragOverKey}
                          setDragOverKey={setDragOverKey}
                          dragActive={!!dragSource}
                          onDropRole={(role) => onDropToSlot(t?.id ?? null, role, w, l)}
                          onDragStartFromSlot={(role) => t && setDragSource({ kind: "slot", teamId: t.id, role })}
                          onClearSlot={(role) => t && clearSlot(t.id, role)}
                          onRemoveTeam={() => t && removeTeam(t.id)}
                        />
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {benchTeams.length > 0 && (
        <Card className="p-3 space-y-2.5">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bench ({benchTeams.length})</div>
          <div className="space-y-2">
            {benchTeams.map((t) => (
              <LaneCard
                key={t.id}
                lane={null}
                team={t}
                wave={null}
                nameOf={dn}
                memberSlotCount={memberSlotCount}
                duplicateIds={duplicateIds}
                dragOverKey={dragOverKey}
                setDragOverKey={setDragOverKey}
                dragActive={!!dragSource}
                onDropRole={(role) => onDropToSlot(t.id, role, null, null)}
                onDragStartFromSlot={(role) => setDragSource({ kind: "slot", teamId: t.id, role })}
                onClearSlot={(role) => clearSlot(t.id, role)}
                onRemoveTeam={() => removeTeam(t.id)}
              />
            ))}
          </div>
        </Card>
      )}

      {dragSource && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOverKey("new-team"); }}
          onDragLeave={() => setDragOverKey((k) => (k === "new-team" ? null : k))}
          onDrop={(e) => { e.preventDefault(); onDropToSlot(null, dragSource.kind === "slot" ? dragSource.role : "driver", null, null); }}
          className={[
            "rounded-xl border-2 border-dashed p-4 text-center text-xs font-medium transition-colors",
            dragOverKey === "new-team" ? "border-primary bg-primary/10 text-primary" : "border-muted-foreground/30 text-muted-foreground",
          ].join(" ")}
        >
          Drop here to start a new bench team
        </div>
      )}
    </div>
  );
}

function StatTile({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: number; tone: "default" | "blue" | "green" | "purple" }) {
  const toneClasses = {
    default: "bg-card border-border",
    blue: "bg-blue-50 border-blue-200",
    green: "bg-green-50 border-green-200",
    purple: "bg-purple-50 border-purple-200",
  }[tone];
  const iconTone = {
    default: "text-foreground",
    blue: "text-blue-600",
    green: "text-green-600",
    purple: "text-purple-600",
  }[tone];
  return (
    <Card className={`p-3 ${toneClasses}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${iconTone}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </Card>
  );
}

function PoolCard({ member, onDragStart }: { member: Member; onDragStart: () => void }) {
  const roles: Role[] = [
    ...(member.driver_flag ? (["driver"] as const) : []),
    ...(member.crew_flag ? (["crew"] as const) : []),
    ...(member.patient_flag ? (["patient"] as const) : []),
  ];
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="rounded-lg border bg-card p-2.5 cursor-grab active:cursor-grabbing select-none touch-none"
    >
      <div className="flex items-start gap-1.5">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{member.display_name}</div>
          {roles.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {roles.map((r) => (
                <span key={r} className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${ROLE_CONFIG[r].chip}`}>
                  {ROLE_CONFIG[r].label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RoleSlot({
  role, team, nameOf, memberSlotCount, duplicateIds, dragKey, dragOverKey, setDragOverKey, dragActive,
  onDrop, onDragStartFromSlot, onClear,
}: {
  role: Role;
  team: Team | null;
  nameOf: (id: string | null | undefined) => string;
  memberSlotCount: Record<string, number>;
  duplicateIds: Set<string>;
  dragKey: string;
  dragOverKey: string | null;
  setDragOverKey: (k: string | null) => void;
  dragActive: boolean;
  onDrop: () => void;
  onDragStartFromSlot: () => void;
  onClear: () => void;
}) {
  const cfg = ROLE_CONFIG[role];
  const Icon = cfg.icon;
  const memberId = team ? (team[`${role}_id` as const] as string | null) : null;
  const isOver = dragOverKey === dragKey;
  const isDuplicate = memberId ? duplicateIds.has(memberId) : false;
  const count = memberId ? (memberSlotCount[memberId] ?? 0) : 0;

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOverKey(dragKey); }}
      onDragLeave={() => setDragOverKey(null)}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      className={[
        "flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors min-h-[44px]",
        memberId
          ? isDuplicate
            ? "bg-amber-50 border-amber-300"
            : `${cfg.chip}`
          : isOver && dragActive
          ? `bg-primary/10 border-primary border-dashed`
          : "bg-muted/30 border-dashed border-border",
      ].join(" ")}
    >
      <Icon className={`h-3.5 w-3.5 shrink-0 ${memberId ? "" : "text-muted-foreground/50"}`} />
      <span className="text-[9px] font-bold uppercase tracking-wide opacity-60 shrink-0 w-12">{cfg.label}</span>
      {memberId ? (
        <div
          draggable
          onDragStart={onDragStartFromSlot}
          className="flex-1 min-w-0 flex items-center justify-between gap-1 cursor-grab active:cursor-grabbing"
        >
          <span className="text-sm font-medium truncate">
            {nameOf(memberId)}
            {count >= 2 && <span className="ml-1 text-[9px] font-bold text-amber-700">×{count}</span>}
          </span>
          <button type="button" onClick={onClear} className="shrink-0 opacity-50 hover:opacity-100 p-0.5">
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground/60 flex-1">Drop {cfg.label.toLowerCase()} here</span>
      )}
      {isDuplicate && <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />}
    </div>
  );
}

function LaneCard({
  lane, team, wave, nameOf, memberSlotCount, duplicateIds, dragOverKey, setDragOverKey, dragActive,
  onDropRole, onDragStartFromSlot, onClearSlot, onRemoveTeam,
}: {
  lane: number | null;
  team: Team | null;
  wave: number | null;
  nameOf: (id: string | null | undefined) => string;
  memberSlotCount: Record<string, number>;
  duplicateIds: Set<string>;
  dragOverKey: string | null;
  setDragOverKey: (k: string | null) => void;
  dragActive: boolean;
  onDropRole: (role: Role) => void;
  onDragStartFromSlot: (role: Role) => void;
  onClearSlot: (role: Role) => void;
  onRemoveTeam: () => void;
}) {
  const keyPrefix = `${wave ?? "bench"}-${lane ?? team?.id ?? "x"}`;
  return (
    <div className="rounded-xl border bg-card/50 p-2.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {lane != null ? `Lane ${lane}` : "Unplaced"}
        </span>
        {team && (
          <button type="button" onClick={onRemoveTeam} className="text-muted-foreground/60 hover:text-destructive">
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        {(["driver", "crew", "patient"] as Role[]).map((role) => (
          <RoleSlot
            key={role}
            role={role}
            team={team}
            nameOf={nameOf}
            memberSlotCount={memberSlotCount}
            duplicateIds={duplicateIds}
            dragKey={`${keyPrefix}-${role}`}
            dragOverKey={dragOverKey}
            setDragOverKey={setDragOverKey}
            dragActive={dragActive}
            onDrop={() => onDropRole(role)}
            onDragStartFromSlot={() => onDragStartFromSlot(role)}
            onClear={() => onClearSlot(role)}
          />
        ))}
      </div>
    </div>
  );
}

function ReadOnlyGrid({
  cfg, teams, nameOf, memberSlotCount, duplicateIds,
}: {
  cfg: Cfg;
  teams: Team[];
  nameOf: (id: string | null | undefined) => string;
  memberSlotCount: Record<string, number>;
  duplicateIds: Set<string>;
}) {
  return (
    <div className="space-y-3">
      {Array.from({ length: cfg.waves_count }, (_, wi) => wi + 1).map((w) => (
        <div key={w}>
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Wave {w}</div>
          <div className="space-y-1.5">
            {Array.from({ length: cfg.lanes_count }, (_, li) => li + 1).map((l) => {
              const t = teams.find((x) => x.wave === w && x.lane === l);
              return (
                <div key={l} className="rounded-lg border p-2 text-xs bg-card">
                  <span className="text-[9px] opacity-60 mr-1.5">L{l}</span>
                  {t ? (
                    (["driver", "crew", "patient"] as Role[])
                      .map((role) => t[`${role}_id` as const])
                      .filter(Boolean)
                      .map((id) => (
                        <span key={id} className="mr-2">
                          {nameOf(id)}
                          {duplicateIds.has(id as string) && <span className="text-amber-600 ml-0.5">×{memberSlotCount[id as string]}</span>}
                        </span>
                      ))
                  ) : (
                    <span className="opacity-40">—</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
