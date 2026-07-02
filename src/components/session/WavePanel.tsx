/**
 * WavePanel — correct IRB mental model:
 *
 *   team = Driver + Crew (a saved pair or manually built)
 *   wave = a set of teams racing simultaneously
 *   lane = a team's lane within a wave
 *
 * Patients are optional per-session (toggle on sessions.patients_enabled).
 * "Going twice" = person whose partner is absent, marked in red.
 *
 * Workflow:
 *   1. Build teams from confirmed partner pairs (auto) or manually
 *   2. Assign teams to Wave / Lane slots
 *   3. Unplaced teams sit on the bench
 *   4. Coach drags / taps teams between slots to reorder
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/lib/confirm";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Lock, Share2, Shuffle, Trash2, Users, ChevronDown, ChevronUp, AlertTriangle,
  Car, UserCheck, HeartPulse, Plus, GripVertical, X, Repeat2,
} from "lucide-react";
import { showToast } from "@/lib/toast";
import { format } from "date-fns";
import { buildNameMap, memberFullName } from "@/lib/names";
import { notifyMembers } from "@/lib/notify";

export type WavePanelProps = {
  sessionId: string;
  clubId: string;
  sessionTitle: string;
  sessionStartsAt: string;
  goingIds: string[];       // member IDs with RSVP = going
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

type Member = {
  id: string;
  display_name: string;
  auth_user_id: string | null;
  driver_flag: boolean;
  crew_flag: boolean;
  patient_flag: boolean;
};

type Partner = { driver_id: string; crew_id: string };

// ── Helpers ──────────────────────────────────────────────────────────────────

function slot(t: Team) {
  return t.wave != null && t.lane != null;
}

function fullName(m: Member) { return m.display_name; }

// ── Main component ────────────────────────────────────────────────────────────

export function WavePanel({
  sessionId, clubId, sessionTitle, sessionStartsAt, goingIds, canManage,
}: WavePanelProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Record<string, Member>>({});
  const [partners, setPartners] = useState<Partner[]>([]);
  const [patientsEnabled, setPatientsEnabled] = useState(false);
  const [numWaves, setNumWaves] = useState(1);
  const [numLanes, setNumLanes] = useState(4);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);   // selected team id
  const [collapsedWaves, setCollapsedWaves] = useState<Set<number>>(new Set());
  const [dragTeamId, setDragTeamId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [addTeamOpen, setAddTeamOpen] = useState(false);
  const [newDriver, setNewDriver] = useState("");
  const [newCrew, setNewCrew] = useState("");
  const confirm = useConfirm();

  const load = useCallback(async () => {
    const [{ data: t }, { data: p }, { data: s }, { data: profs }] = await Promise.all([
      supabase.from("session_teams").select("*").eq("session_id", sessionId).order("wave").order("lane"),
      supabase.from("member_partners").select("driver_id, crew_id").eq("club_id", clubId),
      supabase.from("sessions").select("patients_enabled").eq("id", sessionId).maybeSingle(),
      goingIds.length
        ? supabase.from("members")
            .select("id, auth_user_id, first_name, last_name, preferred_name, driver_flag, crew_flag, patient_flag")
            .in("id", goingIds)
            .eq("club_id", clubId)
        : Promise.resolve({ data: [] as never[] }),
    ]);

    setTeams((t ?? []) as Team[]);
    setPartners((p ?? []) as Partner[]);
    setPatientsEnabled(!!(s as { patients_enabled?: boolean } | null)?.patients_enabled);

    const map: Record<string, Member> = {};
    ((profs as { id: string; auth_user_id: string | null; first_name: string | null; last_name: string | null; preferred_name: string | null; driver_flag: boolean | null; crew_flag: boolean | null; patient_flag: boolean | null }[] | null) ?? []).forEach((m) => {
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

    // Auto-set numLanes / numWaves from existing teams
    const placed = ((t ?? []) as Team[]).filter(slot);
    if (placed.length > 0) {
      setNumLanes(Math.max(...placed.map((x) => x.lane ?? 1)));
      setNumWaves(Math.max(...placed.map((x) => x.wave ?? 1)));
    }
  }, [sessionId, clubId, goingIds]);

  useEffect(() => { load(); }, [load]);

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

  // Count how many teams each member appears in (driver OR crew slots)
  const memberTeamCount = useMemo(() => {
    const c: Record<string, number> = {};
    teams.forEach((t) => {
      if (t.driver_id) c[t.driver_id] = (c[t.driver_id] ?? 0) + 1;
      if (t.crew_id) c[t.crew_id] = (c[t.crew_id] ?? 0) + 1;
    });
    return c;
  }, [teams]);

  // Members in at least one team already
  const inTeamIds = useMemo(() => {
    const s = new Set<string>();
    teams.forEach((t) => { if (t.driver_id) s.add(t.driver_id); if (t.crew_id) s.add(t.crew_id); });
    return s;
  }, [teams]);

  const teamLabel = useCallback((t: Team) => {
    const d = t.driver_id ? dn(t.driver_id) : null;
    const c = t.crew_id ? dn(t.crew_id) : null;
    return [d, c].filter(Boolean).join(" + ") || "Empty";
  }, [dn]);

  const placedTeams = useMemo(() => teams.filter(slot), [teams]);
  const benchTeams = useMemo(() => teams.filter((t) => !slot(t)), [teams]);

  // Going-twice detection (appears in 2+ teams)
  const goingTwiceIds = useMemo(
    () => new Set(Object.entries(memberTeamCount).filter(([, n]) => n >= 2).map(([id]) => id)),
    [memberTeamCount],
  );

  // ── Toggle patients ───────────────────────────────────────────────────────
  const togglePatients = async (enabled: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("sessions") as any).update({ patients_enabled: enabled }).eq("id", sessionId);
    if (error) { showToast.error(error.message); return; }
    setPatientsEnabled(enabled);
    showToast.success(enabled ? "Patients enabled for this session" : "Patients disabled");
  };

  // ── Build teams from saved partner pairs ──────────────────────────────────
  const buildFromPairs = async () => {
    setBusy(true);
    const used = new Set<string>(inTeamIds);
    const toInsert: { session_id: string; driver_id: string; crew_id: string }[] = [];

    for (const p of partners) {
      const dId = authToMemberId[p.driver_id] ?? p.driver_id;
      const cId = authToMemberId[p.crew_id] ?? p.crew_id;
      if (!goingSet.has(dId) || !goingSet.has(cId)) continue;
      if (used.has(dId) || used.has(cId)) continue;
      toInsert.push({ session_id: sessionId, driver_id: dId, crew_id: cId });
      used.add(dId); used.add(cId);
    }

    if (!toInsert.length) {
      setBusy(false);
      showToast.info("No new confirmed pairs to add. All saved pairs are either already placed or not attending.");
      return;
    }
    const { error } = await supabase.from("session_teams").insert(toInsert);
    setBusy(false);
    if (error) { showToast.error(error.message); return; }
    showToast.success(`Added ${toInsert.length} team${toInsert.length === 1 ? "" : "s"} from saved pairs`);
    load();
  };

  // ── Auto-pair unpaired members ────────────────────────────────────────────
  const autoPair = async () => {
    const unpaired = goingIds.filter((id) => !inTeamIds.has(id) && members[id]);
    if (!unpaired.length) {
      showToast.info("Everyone confirmed is already in a team.");
      return;
    }
    setBusy(true);
    const used = new Set<string>();
    const inserts: { session_id: string; driver_id: string | null; crew_id: string | null }[] = [];

    const drivers = unpaired.filter((id) => members[id]?.driver_flag && !members[id]?.crew_flag);
    const crew = unpaired.filter((id) => members[id]?.crew_flag && !members[id]?.driver_flag);
    const both = unpaired.filter((id) => members[id]?.driver_flag && members[id]?.crew_flag);
    const neither = unpaired.filter((id) => !members[id]?.driver_flag && !members[id]?.crew_flag);

    const driverPool = [...drivers, ...both];
    const availCrew = () => [...crew.filter((id) => !used.has(id)), ...both.filter((id) => !used.has(id))];

    for (const dId of driverPool) {
      if (used.has(dId)) continue;
      const crewList = availCrew();
      if (!crewList.length) {
        inserts.push({ session_id: sessionId, driver_id: dId, crew_id: null });
        used.add(dId); continue;
      }
      const cId = crewList[0];
      inserts.push({ session_id: sessionId, driver_id: dId, crew_id: cId });
      used.add(dId); used.add(cId);
    }
    for (const cId of crew) {
      if (used.has(cId)) continue;
      inserts.push({ session_id: sessionId, driver_id: null, crew_id: cId });
      used.add(cId);
    }
    // Members with no role — pair them together
    const pool = neither.filter((id) => !used.has(id));
    for (let i = 0; i + 1 < pool.length; i += 2) {
      inserts.push({ session_id: sessionId, driver_id: pool[i], crew_id: pool[i + 1] });
    }
    if (pool.length % 2 === 1) {
      inserts.push({ session_id: sessionId, driver_id: pool[pool.length - 1], crew_id: null });
    }

    const safe = inserts.filter((r) =>
      (r.driver_id == null || r.driver_id in members) &&
      (r.crew_id == null || r.crew_id in members)
    );
    if (!safe.length) { setBusy(false); showToast.error("No eligible members to pair."); return; }
    const { error } = await supabase.from("session_teams").insert(safe);
    setBusy(false);
    if (error) { showToast.error(error.message); return; }
    showToast.success(`Auto-paired ${safe.length} team${safe.length === 1 ? "" : "s"}`);
    load();
  };

  // ── Create team manually ──────────────────────────────────────────────────
  const createTeam = async () => {
    if (!newDriver && !newCrew) { showToast.error("Select at least a driver or crew."); return; }
    setBusy(true);
    const { error } = await supabase.from("session_teams").insert({
      session_id: sessionId,
      driver_id: newDriver || null,
      crew_id: newCrew || null,
    });
    setBusy(false);
    if (error) { showToast.error(error.message); return; }
    setNewDriver(""); setNewCrew(""); setAddTeamOpen(false);
    showToast.success("Team created");
    load();
  };

  // ── Remove a team ─────────────────────────────────────────────────────────
  const removeTeam = async (id: string) => {
    const t = teams.find((x) => x.id === id);
    const ok = await confirm({
      title: "Remove team?",
      description: `${t ? teamLabel(t) : "This team"} will be removed from the draw.`,
      confirmText: "Remove",
    });
    if (!ok) return;
    const { error } = await supabase.from("session_teams").delete().eq("id", id);
    if (error) { showToast.error(error.message); return; }
    showToast.success("Team removed");
    if (selected === id) setSelected(null);
    load();
  };

  // ── Clear all ─────────────────────────────────────────────────────────────
  const clearAll = async () => {
    const ok = await confirm({
      title: "Clear all teams?",
      description: "Every team and wave assignment for this session will be removed.",
      confirmText: "Clear all",
    });
    if (!ok) return;
    const { error } = await supabase.from("session_teams").delete().eq("session_id", sessionId);
    if (error) { showToast.error(error.message); return; }
    setSelected(null);
    showToast.success("Waves cleared");
    load();
  };

  // ── Move/swap team into a slot ────────────────────────────────────────────
  const moveToSlot = async (teamId: string, wave: number | null, lane: number | null) => {
    const moving = teams.find((t) => t.id === teamId);
    if (!moving) return;
    if (moving.wave === wave && moving.lane === lane) { setSelected(null); return; }

    // If occupied, swap
    const occupant = wave != null && lane != null
      ? teams.find((t) => t.wave === wave && t.lane === lane && t.id !== teamId)
      : null;

    setBusy(true);
    if (occupant) {
      await supabase.from("session_teams").update({ wave: null, lane: null }).eq("id", occupant.id);
    }
    const { error } = await supabase.from("session_teams").update({ wave, lane }).eq("id", teamId);
    if (error) { setBusy(false); showToast.error(error.message); return; }
    if (occupant && moving.wave != null && moving.lane != null) {
      await supabase.from("session_teams").update({ wave: moving.wave, lane: moving.lane }).eq("id", occupant.id);
    }
    setBusy(false);
    setSelected(null);
    load();
  };

  // ── Set patient on a team ─────────────────────────────────────────────────
  const setPatient = async (teamId: string, patientId: string | null) => {
    const { error } = await supabase.from("session_teams").update({ patient_id: patientId }).eq("id", teamId);
    if (error) { showToast.error(error.message); return; }
    load();
  };

  // ── Share ──────────────────────────────────────────────────────────────────
  const shareDraw = async () => {
    const lines = [`🚤 ${sessionTitle}`, format(new Date(sessionStartsAt), "EEE d MMM yyyy, h:mm a"), ""];
    for (let w = 1; w <= numWaves; w++) {
      lines.push(`Wave ${w}`);
      for (let l = 1; l <= numLanes; l++) {
        const t = teams.find((x) => x.wave === w && x.lane === l);
        const pat = patientsEnabled && t?.patient_id ? ` | Patient: ${dn(t.patient_id)}` : "";
        lines.push(`  Lane ${l}: ${t ? teamLabel(t) : "—"}${pat}`);
      }
      lines.push("");
    }
    if (benchTeams.length) {
      lines.push("Bench");
      benchTeams.forEach((t) => lines.push(`  • ${teamLabel(t)}`));
    }
    const text = lines.join("\n");
    try {
      if (navigator.share) await navigator.share({ text, title: sessionTitle });
      else { await navigator.clipboard.writeText(text); showToast.success("Copied to clipboard"); }
    } catch { /* cancelled */ }
    if (canManage && goingIds.length > 0) {
      void notifyMembers(goingIds, {
        club_id: clubId,
        notification_type: "wave_draw_published",
        message: `Wave draw ready: ${sessionTitle}`,
        related_id: sessionId,
      });
    }
  };

  // ── Auto-distribute bench teams into empty slots ───────────────────────────
  const autoBalance = async () => {
    if (!teams.length) { showToast.error("Create teams first before balancing."); return; }
    setBusy(true);
    const slots: { wave: number; lane: number }[] = [];
    for (let w = 1; w <= numWaves; w++) for (let l = 1; l <= numLanes; l++) slots.push({ wave: w, lane: l });
    const sorted = [...teams].sort((a, b) => teamLabel(a).localeCompare(teamLabel(b)));
    for (let i = 0; i < sorted.length; i++) {
      const s = slots[i] ?? null;
      const { error } = await supabase.from("session_teams")
        .update({ wave: s?.wave ?? null, lane: s?.lane ?? null })
        .eq("id", sorted[i].id);
      if (error) { setBusy(false); showToast.error(error.message); return; }
    }
    setBusy(false);
    showToast.success("Waves auto-balanced");
    load();
  };

  // ── Read-only view ─────────────────────────────────────────────────────────
  if (!canManage) {
    if (!placedTeams.length) {
      return <Card className="p-4 text-sm text-muted-foreground"><Lock className="h-4 w-4 inline mr-2" />No draw published yet.</Card>;
    }
    return (
      <div className="space-y-3">
        {Array.from({ length: numWaves }, (_, wi) => wi + 1).map((w) => (
          <Card key={w} className="p-3">
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Wave {w}</div>
            <div className="space-y-1.5">
              {Array.from({ length: numLanes }, (_, li) => li + 1).map((l) => {
                const t = teams.find((x) => x.wave === w && x.lane === l);
                return (
                  <div key={l} className="flex items-center gap-2 rounded-lg border p-2 text-sm bg-card">
                    <span className="text-[10px] text-muted-foreground w-12 shrink-0">Lane {l}</span>
                    {t ? (
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <RoleRow icon={Car} name={dn(t.driver_id)} goingTwice={!!t.driver_id && goingTwiceIds.has(t.driver_id)} />
                        <RoleRow icon={UserCheck} name={dn(t.crew_id)} goingTwice={!!t.crew_id && goingTwiceIds.has(t.crew_id)} />
                        {patientsEnabled && <RoleRow icon={HeartPulse} name={dn(t.patient_id)} goingTwice={false} />}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    );
  }

  // ── Coach view ─────────────────────────────────────────────────────────────
  const unpairedMembers = goingIds.filter((id) => !inTeamIds.has(id) && members[id]);

  return (
    <div className="space-y-4">

      {/* ── Stats row ── */}
      <div className="grid grid-cols-4 gap-2">
        <StatTile label="Going" value={goingIds.length} icon={Users} />
        <StatTile label="Teams" value={teams.length} icon={Car} />
        <StatTile label="Placed" value={placedTeams.length} icon={UserCheck} color="green" />
        {goingTwiceIds.size > 0
          ? <StatTile label="×2" value={goingTwiceIds.size} icon={Repeat2} color="red" />
          : <StatTile label="Bench" value={benchTeams.length} icon={Users} color={benchTeams.length > 0 ? "amber" : "default"} />}
      </div>

      {/* Going-twice warning */}
      {goingTwiceIds.size > 0 && (
        <Card className="p-3 border-red-300 bg-red-50">
          <div className="flex items-start gap-2">
            <Repeat2 className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs text-red-800">
              <span className="font-semibold">Going twice ({goingTwiceIds.size}):</span>{" "}
              {Array.from(goingTwiceIds).map((id) => dn(id)).join(", ")}
            </div>
          </div>
        </Card>
      )}

      {/* ── Patients toggle ── */}
      <Card className="p-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium flex items-center gap-1.5">
            <HeartPulse className="h-4 w-4 text-purple-600" /> Patients this session
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {patientsEnabled ? "Patient slots shown on each team" : "Patient slots hidden"}
          </div>
        </div>
        <Switch checked={patientsEnabled} onCheckedChange={togglePatients} />
      </Card>

      {/* ── Action buttons ── */}
      <Card className="p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={buildFromPairs} disabled={busy} variant="secondary" className="h-11">
            <Shuffle className="h-4 w-4 mr-1.5" />Confirmed Pairs
          </Button>
          <Button onClick={autoPair} disabled={busy} className="h-11">
            <Shuffle className="h-4 w-4 mr-1.5" />Auto Pair
          </Button>
          <Button onClick={autoBalance} disabled={busy || !teams.length} variant="outline" className="h-11">
            <Users className="h-4 w-4 mr-1.5" />Auto Balance
          </Button>
          <Button onClick={shareDraw} disabled={busy} variant="outline" className="h-11">
            <Share2 className="h-4 w-4 mr-1.5" />Share Waves
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => setAddTeamOpen((o) => !o)} disabled={busy} variant="outline" className="h-9">
            <Plus className="h-4 w-4 mr-1.5" />Add Team
          </Button>
          <Button
            onClick={clearAll}
            disabled={busy || !teams.length}
            variant="outline"
            className="h-9 text-destructive border-destructive/30 hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4 mr-1.5" />Clear All
          </Button>
        </div>

        {addTeamOpen && (
          <div className="rounded-xl border p-3 space-y-2.5 bg-muted/30 mt-1">
            <div className="text-xs font-semibold">Add team manually</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground mb-1 block">Driver</Label>
                <Select value={newDriver} onValueChange={setNewDriver}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Driver…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— None —</SelectItem>
                    {goingIds.filter((id) => members[id]).sort((a, b) => dn(a).localeCompare(dn(b))).map((id) => (
                      <SelectItem key={id} value={id}>{dn(id)}{memberTeamCount[id] ? ` (×${memberTeamCount[id] + 1})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground mb-1 block">Crew</Label>
                <Select value={newCrew} onValueChange={setNewCrew}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Crew…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— None —</SelectItem>
                    {goingIds.filter((id) => members[id]).sort((a, b) => dn(a).localeCompare(dn(b))).map((id) => (
                      <SelectItem key={id} value={id}>{dn(id)}{memberTeamCount[id] ? ` (×${memberTeamCount[id] + 1})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { setAddTeamOpen(false); setNewDriver(""); setNewCrew(""); }} className="flex-1">Cancel</Button>
              <Button size="sm" onClick={createTeam} loading={busy} className="flex-1">Add</Button>
            </div>
          </div>
        )}
      </Card>

      {/* ── Wave layout controls ── */}
      <Card className="p-3 space-y-3">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Wave layout</div>
        <div className="flex items-center gap-4">
          <div className="space-y-1 flex-1">
            <Label className="text-[10px] text-muted-foreground">Waves</Label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button key={n} type="button"
                  onClick={() => setNumWaves(n)}
                  className={`w-9 h-9 rounded-lg border text-sm font-semibold transition-colors ${numWaves === n ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-muted"}`}
                >{n}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1 flex-1">
            <Label className="text-[10px] text-muted-foreground">Lanes</Label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <button key={n} type="button"
                  onClick={() => setNumLanes(n)}
                  className={`w-9 h-9 rounded-lg border text-sm font-semibold transition-colors ${numLanes === n ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-muted"}`}
                >{n}</button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Selection hint ── */}
      {selected && (
        <Card className="p-3 border-primary/50 bg-primary/5 flex items-center justify-between">
          <div className="text-xs">
            <span className="font-semibold text-primary">{teamLabel(teams.find((t) => t.id === selected)!)}</span>
            <span className="text-muted-foreground ml-1.5">— tap a slot to place or swap</span>
          </div>
          <button type="button" onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground ml-2">
            <X className="h-4 w-4" />
          </button>
        </Card>
      )}

      {/* ── Waves grid ── */}
      <div className="space-y-3">
        {Array.from({ length: numWaves }, (_, wi) => wi + 1).map((w) => {
          const isCollapsed = collapsedWaves.has(w);
          const waveTeams = teams.filter((t) => t.wave === w);
          return (
            <Card key={w} className="overflow-hidden">
              <button
                type="button"
                onClick={() => setCollapsedWaves((prev) => {
                  const next = new Set(prev);
                  if (next.has(w)) next.delete(w); else next.add(w);
                  return next;
                })}
                className="w-full flex items-center justify-between p-3 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">Wave {w}</span>
                  <Badge variant="secondary" className="text-[10px] h-5">{waveTeams.length}/{numLanes} lanes</Badge>
                  {waveTeams.some((t) => t.driver_id && goingTwiceIds.has(t.driver_id) || t.crew_id && goingTwiceIds.has(t.crew_id)) && (
                    <Badge className="text-[10px] h-5 bg-red-100 text-red-700 border-red-200">×2</Badge>
                  )}
                </div>
                {isCollapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
              </button>

              {!isCollapsed && (
                <div className="px-3 pb-3 space-y-2">
                  {Array.from({ length: numLanes }, (_, li) => li + 1).map((l) => {
                    const t = teams.find((x) => x.wave === w && x.lane === l);
                    const isSelected = selected === t?.id;
                    const isTarget = !!selected && selected !== t?.id;
                    return (
                      <LaneSlot
                        key={l}
                        lane={l}
                        team={t ?? null}
                        patientsEnabled={patientsEnabled}
                        goingIds={goingIds}
                        members={members}
                        nameOf={dn}
                        goingTwiceIds={goingTwiceIds}
                        isSelected={isSelected}
                        isTarget={isTarget}
                        dragOver={dragOverKey === `${w}-${l}`}
                        onSelect={() => {
                          if (!t && selected) { moveToSlot(selected, w, l); return; }
                          if (t && selected && selected !== t.id) { moveToSlot(selected, w, l); return; }
                          setSelected((cur) => (cur === t?.id ? null : t?.id ?? null));
                        }}
                        onRemove={() => t && removeTeam(t.id)}
                        onSendToBench={() => t && moveToSlot(t.id, null, null)}
                        onSetPatient={(pid) => t && setPatient(t.id, pid)}
                        onDragStart={() => t && setDragTeamId(t.id)}
                        onDragOver={() => setDragOverKey(`${w}-${l}`)}
                        onDragLeave={() => setDragOverKey(null)}
                        onDrop={() => {
                          setDragOverKey(null);
                          if (dragTeamId) { moveToSlot(dragTeamId, w, l); setDragTeamId(null); }
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* ── Bench ── */}
      {benchTeams.length > 0 && (
        <Card className="p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bench ({benchTeams.length})</span>
            <span className="text-[11px] text-muted-foreground">— tap to select, then tap a wave slot to place</span>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {benchTeams.map((t) => (
              <BenchTeamCard
                key={t.id}
                team={t}
                nameOf={dn}
                goingTwiceIds={goingTwiceIds}
                isSelected={selected === t.id}
                onSelect={() => setSelected((cur) => (cur === t.id ? null : t.id))}
                onRemove={() => removeTeam(t.id)}
                onDragStart={() => setDragTeamId(t.id)}
                onDragEnd={() => setDragTeamId(null)}
              />
            ))}
          </div>
        </Card>
      )}

      {/* ── Unmatched members ── */}
      {unpairedMembers.length > 0 && (
        <Card className="p-3 border-amber-200 bg-amber-50/50 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" />
            Not in any team ({unpairedMembers.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {unpairedMembers.map((id) => (
              <span key={id} className="text-xs bg-amber-100 border border-amber-200 text-amber-900 rounded-full px-2 py-0.5">
                {dn(id)}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function StatTile({ label, value, icon: Icon, color = "default" }: {
  label: string; value: number; icon: typeof Users;
  color?: "default" | "green" | "amber" | "red";
}) {
  const tone = {
    default: "bg-card border-border",
    green: "bg-green-50 border-green-200",
    amber: "bg-amber-50 border-amber-200",
    red: "bg-red-50 border-red-200",
  }[color];
  const iconColor = {
    default: "text-muted-foreground", green: "text-green-600",
    amber: "text-amber-600", red: "text-red-600",
  }[color];
  return (
    <Card className={`p-2.5 ${tone}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-bold">{value}</div>
    </Card>
  );
}

function RoleRow({ icon: Icon, name, goingTwice }: { icon: typeof Car; name: string; goingTwice: boolean }) {
  return (
    <div className="flex items-center gap-1 min-w-0">
      <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
      <span className={`text-xs truncate ${goingTwice ? "text-red-600 font-semibold" : ""}`}>
        {name}
        {goingTwice && <Repeat2 className="h-2.5 w-2.5 inline ml-0.5 text-red-500" />}
      </span>
    </div>
  );
}

function LaneSlot({
  lane, team, patientsEnabled, goingIds, members, nameOf, goingTwiceIds,
  isSelected, isTarget, dragOver,
  onSelect, onRemove, onSendToBench, onSetPatient,
  onDragStart, onDragOver, onDragLeave, onDrop,
}: {
  lane: number;
  team: { id: string; driver_id: string | null; crew_id: string | null; patient_id: string | null; notes: string | null } | null;
  patientsEnabled: boolean;
  goingIds: string[];
  members: Record<string, { id: string; display_name: string; driver_flag: boolean; crew_flag: boolean; patient_flag: boolean; auth_user_id: string | null }>;
  nameOf: (id: string | null | undefined) => string;
  goingTwiceIds: Set<string>;
  isSelected: boolean;
  isTarget: boolean;
  dragOver: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onSendToBench: () => void;
  onSetPatient: (id: string | null) => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
}) {
  const driverGt = !!team?.driver_id && goingTwiceIds.has(team.driver_id);
  const crewGt = !!team?.crew_id && goingTwiceIds.has(team.crew_id);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDragLeave={onDragLeave}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      className={[
        "rounded-xl border transition-all",
        isSelected ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "",
        isTarget && dragOver ? "border-primary border-dashed bg-primary/10" : "",
        isTarget && !dragOver ? "border-dashed border-primary/40" : "",
        !isSelected && !isTarget && !dragOver ? "border-border" : "",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onSelect}
        draggable={!!team}
        onDragStart={onDragStart}
        className="w-full text-left p-2.5 cursor-pointer select-none touch-none"
      >
        <div className="flex items-start gap-2">
          <div className="flex flex-col items-center gap-0.5 shrink-0 mt-0.5">
            <span className="text-[9px] font-bold uppercase text-muted-foreground/70">L{lane}</span>
            {team && <GripVertical className="h-3 w-3 text-muted-foreground/50" />}
          </div>
          {team ? (
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 min-w-0">
                  <Car className="h-3 w-3 text-blue-500 shrink-0" />
                  <span className={`text-sm font-medium truncate ${driverGt ? "text-red-600" : ""}`}>
                    {nameOf(team.driver_id)}
                    {driverGt && <Repeat2 className="h-3 w-3 inline ml-0.5 text-red-500" />}
                  </span>
                </div>
                <span className="text-muted-foreground/40 text-xs">+</span>
                <div className="flex items-center gap-1 min-w-0">
                  <UserCheck className="h-3 w-3 text-green-500 shrink-0" />
                  <span className={`text-sm font-medium truncate ${crewGt ? "text-red-600" : ""}`}>
                    {nameOf(team.crew_id)}
                    {crewGt && <Repeat2 className="h-3 w-3 inline ml-0.5 text-red-500" />}
                  </span>
                </div>
              </div>
              {patientsEnabled && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <HeartPulse className="h-3 w-3 text-purple-500 shrink-0" />
                  <span className="text-xs text-muted-foreground">{nameOf(team.patient_id)}</span>
                </div>
              )}
              {team.notes === "going twice" && (
                <Badge variant="outline" className="text-[9px] h-4 text-red-600 border-red-200 bg-red-50">×2</Badge>
              )}
            </div>
          ) : (
            <div className="flex-1 py-1">
              {isTarget
                ? <span className="text-xs text-primary/70">Drop here</span>
                : <span className="text-xs text-muted-foreground/40">Empty</span>
              }
            </div>
          )}
          {team && (
            <div className="flex flex-col gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={onSendToBench} className="text-muted-foreground/60 hover:text-muted-foreground p-0.5">
                <ChevronDown className="h-3 w-3" />
              </button>
              <button type="button" onClick={onRemove} className="text-muted-foreground/60 hover:text-destructive p-0.5">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </button>

      {/* Patient picker (only when patients enabled and team present) */}
      {patientsEnabled && team && (
        <div className="px-2.5 pb-2.5 pt-0" onClick={(e) => e.stopPropagation()}>
          <Select
            value={team.patient_id ?? "__none"}
            onValueChange={(v) => onSetPatient(v === "__none" ? null : v)}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Assign patient…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">— No patient —</SelectItem>
              {goingIds.filter((id) => members[id]).map((id) => (
                <SelectItem key={id} value={id}>{nameOf(id)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

function BenchTeamCard({
  team, nameOf, goingTwiceIds, isSelected, onSelect, onRemove, onDragStart, onDragEnd,
}: {
  team: { id: string; driver_id: string | null; crew_id: string | null; notes: string | null };
  nameOf: (id: string | null | undefined) => string;
  goingTwiceIds: Set<string>;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const dGt = !!team.driver_id && goingTwiceIds.has(team.driver_id);
  const cGt = !!team.crew_id && goingTwiceIds.has(team.crew_id);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`rounded-xl border p-2.5 flex items-center gap-2.5 cursor-grab active:cursor-grabbing transition-colors ${isSelected ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-border bg-card"}`}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground/50 shrink-0" />
      <button type="button" onClick={onSelect} className="flex-1 text-left flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Car className="h-3.5 w-3.5 text-blue-500" />
          <span className={`text-sm font-medium ${dGt ? "text-red-600" : ""}`}>{nameOf(team.driver_id)}</span>
        </div>
        <span className="text-muted-foreground/40 text-xs">+</span>
        <div className="flex items-center gap-1.5">
          <UserCheck className="h-3.5 w-3.5 text-green-500" />
          <span className={`text-sm font-medium ${cGt ? "text-red-600" : ""}`}>{nameOf(team.crew_id)}</span>
        </div>
        {(dGt || cGt) && <Badge variant="outline" className="text-[9px] h-4 text-red-600 border-red-200 bg-red-50">×2</Badge>}
      </button>
      <button type="button" onClick={onRemove} className="text-muted-foreground/60 hover:text-destructive shrink-0">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
