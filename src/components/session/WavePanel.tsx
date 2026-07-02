/**
 * WavePanel — IRB wave draw manager
 *
 * team = Driver + Crew pair
 * wave = set of teams running simultaneously
 * lane = a team's slot within a wave
 *
 * Mobile UX:
 *  - Tap bench team → it glows (selected)
 *  - Tap any slot → places or swaps selected team there
 *  - Big sticky "Placing X" bar stays visible while selecting
 *  - Recommended layouts calculated from team count + max lanes cap
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
  Car, UserCheck, HeartPulse, Plus, Repeat2, Sparkles, X, ArrowLeftRight,
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
type Member = {
  id: string;
  display_name: string;
  auth_user_id: string | null;
  driver_flag: boolean;
  crew_flag: boolean;
  patient_flag: boolean;
};
type Partner = { driver_id: string; crew_id: string };

function isPlaced(t: Team) { return t.wave != null && t.lane != null; }

// ── Layout recommendation engine ─────────────────────────────────────────────

type Layout = { waves: number; lanes: number; empty: number; recommended?: boolean };

function recommendLayouts(teamCount: number, maxLanes: number): Layout[] {
  if (teamCount === 0) return [];
  const all: Layout[] = [];
  for (let lanes = 1; lanes <= maxLanes; lanes++) {
    const waves = Math.ceil(teamCount / lanes);
    const empty = waves * lanes - teamCount;
    all.push({ waves, lanes, empty });
  }
  // "Good" = ≤2 empty slots
  const good = all.filter((o) => o.empty <= 2);
  const pool = good.length > 0 ? good : all.slice(0, 3);
  // Sort: fewest empty first, then fewest waves (faster session)
  pool.sort((a, b) => a.empty - b.empty || a.waves - b.waves);
  if (pool.length > 0) pool[0].recommended = true;
  return pool.slice(0, 5);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WavePanel({
  sessionId, clubId, sessionTitle, sessionStartsAt, goingIds, canManage,
}: WavePanelProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Record<string, Member>>({});
  const [partners, setPartners] = useState<Partner[]>([]);
  const [patientsEnabled, setPatientsEnabled] = useState(false);
  const [numWaves, setNumWaves] = useState(1);
  const [numLanes, setNumLanes] = useState(4);
  const [maxLanes, setMaxLanes] = useState(5);   // equipment cap
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [collapsedWaves, setCollapsedWaves] = useState<Set<number>>(new Set());
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
            .in("id", goingIds).eq("club_id", clubId)
        : Promise.resolve({ data: [] as never[] }),
    ]);
    const rows = (t ?? []) as Team[];
    setTeams(rows);
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
    // Infer grid from existing placed teams
    const placed = rows.filter(isPlaced);
    if (placed.length > 0) {
      setNumWaves(Math.max(...placed.map((x) => x.wave ?? 1)));
      setNumLanes(Math.max(...placed.map((x) => x.lane ?? 1)));
    }
  }, [sessionId, clubId, goingIds]);

  useEffect(() => { load(); }, [load]);

  const displayMap = useMemo(
    () => buildNameMap(Object.values(members).map((m) => ({ id: m.id, full_name: m.display_name }))),
    [members],
  );
  const dn = useCallback((id: string | null | undefined) => (id && displayMap[id]) || "—", [displayMap]);

  const goingSet = useMemo(() => new Set(goingIds), [goingIds]);
  const authToMemberId = useMemo(() => {
    const m: Record<string, string> = {};
    Object.values(members).forEach((mem) => { if (mem.auth_user_id) m[mem.auth_user_id] = mem.id; });
    return m;
  }, [members]);

  const memberTeamCount = useMemo(() => {
    const c: Record<string, number> = {};
    teams.forEach((t) => {
      if (t.driver_id) c[t.driver_id] = (c[t.driver_id] ?? 0) + 1;
      if (t.crew_id) c[t.crew_id] = (c[t.crew_id] ?? 0) + 1;
    });
    return c;
  }, [teams]);

  const inTeamIds = useMemo(() => {
    const s = new Set<string>();
    teams.forEach((t) => { if (t.driver_id) s.add(t.driver_id); if (t.crew_id) s.add(t.crew_id); });
    return s;
  }, [teams]);

  const teamLabel = useCallback((t: Team) => {
    return [t.driver_id && dn(t.driver_id), t.crew_id && dn(t.crew_id)].filter(Boolean).join(" + ") || "Empty";
  }, [dn]);

  const placedTeams = useMemo(() => teams.filter(isPlaced), [teams]);
  const benchTeams = useMemo(() => teams.filter((t) => !isPlaced(t)), [teams]);

  const goingTwiceIds = useMemo(
    () => new Set(Object.entries(memberTeamCount).filter(([, n]) => n >= 2).map(([id]) => id)),
    [memberTeamCount],
  );

  const unpairedMembers = goingIds.filter((id) => !inTeamIds.has(id) && members[id]);

  // Recommendations update whenever teams or maxLanes changes
  const layouts = useMemo(() => recommendLayouts(teams.length || goingIds.length, maxLanes), [teams.length, goingIds.length, maxLanes]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const togglePatients = async (enabled: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("sessions") as any).update({ patients_enabled: enabled }).eq("id", sessionId);
    if (error) { showToast.error(error.message); return; }
    setPatientsEnabled(enabled);
    showToast.success(enabled ? "Patients enabled" : "Patients disabled");
  };

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
      showToast.info("No new confirmed pairs to add — all saved pairs are either already placed or not attending.");
      return;
    }
    const { error } = await supabase.from("session_teams").insert(toInsert);
    setBusy(false);
    if (error) { showToast.error(error.message); return; }
    showToast.success(`Added ${toInsert.length} team${toInsert.length === 1 ? "" : "s"} from saved pairs`);
    load();
  };

  const autoPair = async () => {
    const unpaired = goingIds.filter((id) => !inTeamIds.has(id) && members[id]);
    if (!unpaired.length) { showToast.info("Everyone is already in a team."); return; }
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
      if (!crewList.length) { inserts.push({ session_id: sessionId, driver_id: dId, crew_id: null }); used.add(dId); continue; }
      const cId = crewList[0];
      inserts.push({ session_id: sessionId, driver_id: dId, crew_id: cId });
      used.add(dId); used.add(cId);
    }
    for (const cId of crew) { if (!used.has(cId)) { inserts.push({ session_id: sessionId, driver_id: null, crew_id: cId }); used.add(cId); } }
    const pool = neither.filter((id) => !used.has(id));
    for (let i = 0; i + 1 < pool.length; i += 2) inserts.push({ session_id: sessionId, driver_id: pool[i], crew_id: pool[i + 1] });
    if (pool.length % 2 === 1) inserts.push({ session_id: sessionId, driver_id: pool[pool.length - 1], crew_id: null });
    const safe = inserts.filter((r) => (r.driver_id == null || r.driver_id in members) && (r.crew_id == null || r.crew_id in members));
    if (!safe.length) { setBusy(false); showToast.error("No eligible members to pair."); return; }
    const { error } = await supabase.from("session_teams").insert(safe);
    setBusy(false);
    if (error) { showToast.error(error.message); return; }
    showToast.success(`Auto-paired ${safe.length} team${safe.length === 1 ? "" : "s"}`);
    load();
  };

  const createTeam = async () => {
    if (!newDriver && !newCrew) { showToast.error("Select at least a driver or crew."); return; }
    setBusy(true);
    const { error } = await supabase.from("session_teams").insert({
      session_id: sessionId,
      driver_id: newDriver && newDriver !== "__none" ? newDriver : null,
      crew_id: newCrew && newCrew !== "__none" ? newCrew : null,
    });
    setBusy(false);
    if (error) { showToast.error(error.message); return; }
    setNewDriver(""); setNewCrew(""); setAddTeamOpen(false);
    showToast.success("Team created");
    load();
  };

  const removeTeam = async (id: string) => {
    const t = teams.find((x) => x.id === id);
    const ok = await confirm({ title: "Remove team?", description: `${t ? teamLabel(t) : "This team"} will be removed.`, confirmText: "Remove" });
    if (!ok) return;
    const { error } = await supabase.from("session_teams").delete().eq("id", id);
    if (error) { showToast.error(error.message); return; }
    if (selected === id) setSelected(null);
    showToast.success("Team removed");
    load();
  };

  const clearAll = async () => {
    const ok = await confirm({ title: "Clear all teams?", description: "Every team and wave assignment will be removed.", confirmText: "Clear all" });
    if (!ok) return;
    const { error } = await supabase.from("session_teams").delete().eq("session_id", sessionId);
    if (error) { showToast.error(error.message); return; }
    setSelected(null);
    showToast.success("Waves cleared");
    load();
  };

  // ── Core placement: tap team → tap slot ──────────────────────────────────
  const moveToSlot = async (teamId: string, wave: number | null, lane: number | null) => {
    const moving = teams.find((t) => t.id === teamId);
    if (!moving) return;
    if (moving.wave === wave && moving.lane === lane) { setSelected(null); return; }
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

  // When any slot is tapped with a selection in progress:
  const handleSlotTap = (wave: number, lane: number) => {
    const t = teams.find((x) => x.wave === wave && x.lane === lane);
    if (selected) {
      moveToSlot(selected, wave, lane);
    } else if (t) {
      setSelected(t.id);
    }
  };

  const setPatient = async (teamId: string, patientId: string | null) => {
    const { error } = await supabase.from("session_teams").update({ patient_id: patientId }).eq("id", teamId);
    if (error) { showToast.error(error.message); return; }
    load();
  };

  const autoBalance = async () => {
    if (!teams.length) { showToast.error("Create teams first."); return; }
    setBusy(true);
    const slots: { wave: number; lane: number }[] = [];
    for (let w = 1; w <= numWaves; w++) for (let l = 1; l <= numLanes; l++) slots.push({ wave: w, lane: l });
    const sorted = [...teams].sort((a, b) => teamLabel(a).localeCompare(teamLabel(b)));
    for (let i = 0; i < sorted.length; i++) {
      const s = slots[i] ?? null;
      const { error } = await supabase.from("session_teams").update({ wave: s?.wave ?? null, lane: s?.lane ?? null }).eq("id", sorted[i].id);
      if (error) { setBusy(false); showToast.error(error.message); return; }
    }
    setBusy(false);
    showToast.success("Waves balanced");
    load();
  };

  const applyLayout = (layout: Layout) => {
    setNumWaves(layout.waves);
    setNumLanes(layout.lanes);
  };

  const shareDraw = async () => {
    const lines = [`🚤 ${sessionTitle}`, format(new Date(sessionStartsAt), "EEE d MMM yyyy, h:mm a"), ""];
    for (let w = 1; w <= numWaves; w++) {
      lines.push(`Wave ${w}`);
      for (let l = 1; l <= numLanes; l++) {
        const t = teams.find((x) => x.wave === w && x.lane === l);
        const pat = patientsEnabled && t?.patient_id ? ` | ${dn(t.patient_id)}` : "";
        lines.push(`  Lane ${l}: ${t ? teamLabel(t) : "—"}${pat}`);
      }
      lines.push("");
    }
    if (benchTeams.length) { lines.push("Bench"); benchTeams.forEach((t) => lines.push(`  • ${teamLabel(t)}`)); }
    const text = lines.join("\n");
    try {
      if (navigator.share) await navigator.share({ text, title: sessionTitle });
      else { await navigator.clipboard.writeText(text); showToast.success("Copied to clipboard"); }
    } catch { /* cancelled */ }
    if (canManage && goingIds.length > 0) {
      void notifyMembers(goingIds, { club_id: clubId, notification_type: "wave_draw_published", message: `Wave draw ready: ${sessionTitle}`, related_id: sessionId });
    }
  };

  // ── Read-only view ─────────────────────────────────────────────────────────
  if (!canManage) {
    if (!placedTeams.length) return <Card className="p-4 text-sm text-muted-foreground"><Lock className="h-4 w-4 inline mr-2" />No draw published yet.</Card>;
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
                      <div className="flex items-center gap-3 flex-1">
                        <span className={`flex items-center gap-1 ${t.driver_id && goingTwiceIds.has(t.driver_id) ? "text-red-600 font-semibold" : ""}`}>
                          <Car className="h-3 w-3 text-blue-500" />{dn(t.driver_id)}
                        </span>
                        <span className="text-muted-foreground/40">+</span>
                        <span className={`flex items-center gap-1 ${t.crew_id && goingTwiceIds.has(t.crew_id) ? "text-red-600 font-semibold" : ""}`}>
                          <UserCheck className="h-3 w-3 text-green-500" />{dn(t.crew_id)}
                        </span>
                        {patientsEnabled && t.patient_id && <span className="flex items-center gap-1"><HeartPulse className="h-3 w-3 text-purple-500" />{dn(t.patient_id)}</span>}
                      </div>
                    ) : <span className="text-muted-foreground/50">—</span>}
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

  const selectedTeam = selected ? teams.find((t) => t.id === selected) : null;

  return (
    <div className="space-y-4">

      {/* ── Stat tiles ── */}
      <div className="grid grid-cols-4 gap-2">
        <StatTile icon={Users} label="Going" value={goingIds.length} />
        <StatTile icon={Car} label="Teams" value={teams.length} />
        <StatTile icon={UserCheck} label="Placed" value={placedTeams.length} color="green" />
        {goingTwiceIds.size > 0
          ? <StatTile icon={Repeat2} label="×2" value={goingTwiceIds.size} color="red" />
          : <StatTile icon={Users} label="Bench" value={benchTeams.length} color={benchTeams.length > 0 ? "amber" : "default"} />
        }
      </div>

      {/* ── Going-twice warning ── */}
      {goingTwiceIds.size > 0 && (
        <Card className="p-3 border-red-300 bg-red-50">
          <div className="flex items-start gap-2">
            <Repeat2 className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs text-red-800">
              <span className="font-semibold">Going twice:</span>{" "}
              {Array.from(goingTwiceIds).map((id) => dn(id)).join(", ")}
            </div>
          </div>
        </Card>
      )}

      {/* ── STICKY selection bar ── */}
      {selectedTeam && (
        <div className="sticky top-2 z-30">
          <Card className="p-3 border-primary bg-primary text-primary-foreground shadow-lg flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide opacity-80">Placing</div>
              <div className="text-sm font-semibold">{teamLabel(selectedTeam)}</div>
              <div className="text-xs opacity-70 mt-0.5">Tap any wave slot to place or swap</div>
            </div>
            <button type="button" onClick={() => setSelected(null)} className="ml-3 p-1.5 rounded-full bg-white/20 hover:bg-white/30">
              <X className="h-4 w-4" />
            </button>
          </Card>
        </div>
      )}

      {/* ── Patients toggle ── */}
      <Card className="p-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium flex items-center gap-1.5">
            <HeartPulse className="h-4 w-4 text-purple-600" /> Patients this session
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{patientsEnabled ? "Patient picker shown per team" : "Patients not required"}</div>
        </div>
        <Switch checked={patientsEnabled} onCheckedChange={togglePatients} />
      </Card>

      {/* ── Action buttons ── */}
      <Card className="p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={buildFromPairs} disabled={busy} variant="secondary" className="h-12 text-sm">
            <ArrowLeftRight className="h-4 w-4 mr-1.5" />Confirmed Pairs
          </Button>
          <Button onClick={autoPair} disabled={busy} className="h-12 text-sm">
            <Shuffle className="h-4 w-4 mr-1.5" />Auto Pair
          </Button>
          <Button onClick={autoBalance} disabled={busy || !teams.length} variant="outline" className="h-12 text-sm">
            <Sparkles className="h-4 w-4 mr-1.5" />Auto Balance
          </Button>
          <Button onClick={shareDraw} disabled={busy} variant="outline" className="h-12 text-sm">
            <Share2 className="h-4 w-4 mr-1.5" />Share Waves
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => setAddTeamOpen((o) => !o)} disabled={busy} variant="outline" className="h-10">
            <Plus className="h-4 w-4 mr-1.5" />Add Team
          </Button>
          <Button onClick={clearAll} disabled={busy || !teams.length} variant="outline" className="h-10 text-destructive border-destructive/30 hover:bg-destructive/10">
            <Trash2 className="h-4 w-4 mr-1.5" />Clear All
          </Button>
        </div>
        {addTeamOpen && (
          <div className="rounded-xl border p-3 space-y-3 bg-muted/30 mt-1">
            <div className="text-xs font-semibold">Add team manually</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground mb-1 block">Driver</Label>
                <Select value={newDriver} onValueChange={setNewDriver}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Driver…" /></SelectTrigger>
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
                  <SelectTrigger className="h-10"><SelectValue placeholder="Crew…" /></SelectTrigger>
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
              <Button size="sm" variant="outline" onClick={() => { setAddTeamOpen(false); setNewDriver(""); setNewCrew(""); }} className="flex-1 h-10">Cancel</Button>
              <Button size="sm" onClick={createTeam} loading={busy} className="flex-1 h-10">Add</Button>
            </div>
          </div>
        )}
      </Card>

      {/* ── Wave layout: max lanes cap + recommendations ── */}
      <Card className="p-3 space-y-3">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Wave layout</div>

        {/* Max lanes equipment cap */}
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">How many lanes do you have equipment for?</Label>
          <div className="flex flex-wrap gap-1.5">
            {[1,2,3,4,5,6,7,8,9,10].map((n) => (
              <button key={n} type="button"
                onClick={() => { setMaxLanes(n); if (numLanes > n) setNumLanes(n); }}
                className={`w-10 h-10 rounded-xl border text-sm font-semibold transition-all ${maxLanes === n ? "bg-primary text-primary-foreground border-primary scale-110" : "bg-card border-border hover:bg-muted"}`}
              >{n}</button>
            ))}
          </div>
        </div>

        {/* Smart recommendations */}
        {layouts.length > 0 && (
          <div className="space-y-2">
            <Label className="text-[11px] text-muted-foreground">
              Recommended for {teams.length || goingIds.length} team{(teams.length || goingIds.length) === 1 ? "" : "s"}
            </Label>
            <div className="space-y-2">
              {layouts.map((layout, i) => {
                const isActive = numWaves === layout.waves && numLanes === layout.lanes;
                return (
                  <button key={i} type="button" onClick={() => applyLayout(layout)}
                    className={`w-full rounded-xl border p-3 text-left transition-all ${isActive ? "bg-primary/10 border-primary" : "bg-card border-border hover:bg-muted/50"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-base font-bold">{layout.waves} wave{layout.waves === 1 ? "" : "s"} × {layout.lanes} lane{layout.lanes === 1 ? "" : "s"}</span>
                      <div className="flex items-center gap-1.5">
                        {layout.recommended && <Badge className="text-[9px] bg-amber-100 text-amber-800 border-amber-200">⭐ Best fit</Badge>}
                        {isActive && <Badge variant="outline" className="text-[9px] border-primary text-primary">Active</Badge>}
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {layout.waves * layout.lanes} total slots · {layout.empty === 0 ? "perfect fit" : `${layout.empty} empty slot${layout.empty === 1 ? "" : "s"}`}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Manual override */}
        <details className="text-xs text-muted-foreground cursor-pointer">
          <summary className="hover:text-foreground">Set manually</summary>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px]">Waves</Label>
              <div className="flex flex-wrap gap-1">
                {[1,2,3,4,5,6,7,8].map((n) => (
                  <button key={n} type="button" onClick={() => setNumWaves(n)}
                    className={`w-9 h-9 rounded-lg border text-sm font-semibold transition-colors ${numWaves === n ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-muted"}`}
                  >{n}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Lanes (max {maxLanes})</Label>
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: maxLanes }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" onClick={() => setNumLanes(n)}
                    className={`w-9 h-9 rounded-lg border text-sm font-semibold transition-colors ${numLanes === n ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-muted"}`}
                  >{n}</button>
                ))}
              </div>
            </div>
          </div>
        </details>
      </Card>

      {/* ── Bench (shown ABOVE waves so it's easy to pick from on mobile) ── */}
      {benchTeams.length > 0 && (
        <Card className="p-3 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Bench — {selected ? "select a wave slot below to place" : "tap a team to select it"}
          </div>
          <div className="grid grid-cols-1 gap-2">
            {benchTeams.map((t) => {
              const isSelected = selected === t.id;
              const dGt = !!t.driver_id && goingTwiceIds.has(t.driver_id);
              const cGt = !!t.crew_id && goingTwiceIds.has(t.crew_id);
              return (
                <div
                  key={t.id}
                  className={[
                    "w-full rounded-xl border p-3 transition-all",
                    isSelected ? "border-primary ring-2 ring-primary/40 bg-primary/5" : "border-border bg-card",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSelected((cur) => cur === t.id ? null : t.id)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left active:scale-98"
                    >
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <Car className="h-4 w-4 text-blue-500 shrink-0" />
                        <span className={`text-sm font-medium truncate ${dGt ? "text-red-600" : ""}`}>{dn(t.driver_id)}</span>
                      </div>
                      <span className="text-muted-foreground/40 shrink-0">+</span>
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <UserCheck className="h-4 w-4 text-green-500 shrink-0" />
                        <span className={`text-sm font-medium truncate ${cGt ? "text-red-600" : ""}`}>{dn(t.crew_id)}</span>
                      </div>
                      {(dGt || cGt) && <Badge variant="outline" className="text-[9px] text-red-600 border-red-200 shrink-0">×2</Badge>}
                    </button>
                    <button type="button" onClick={() => removeTeam(t.id)} className="text-muted-foreground/50 hover:text-destructive p-2 -m-1 shrink-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {isSelected && <div className="text-[11px] text-primary/80 mt-1.5 font-medium">→ Tap a lane below to place</div>}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Wave grid ── */}
      <div className="space-y-3">
        {Array.from({ length: numWaves }, (_, wi) => wi + 1).map((w) => {
          const isCollapsed = collapsedWaves.has(w);
          const waveTeams = teams.filter((t) => t.wave === w);
          const hasDouble = waveTeams.some((t) =>
            (t.driver_id && goingTwiceIds.has(t.driver_id)) || (t.crew_id && goingTwiceIds.has(t.crew_id))
          );
          return (
            <Card key={w} className="overflow-hidden">
              {/* Wave header — collapse on header tap, but NOT when selecting */}
              <button
                type="button"
                onClick={() => {
                  if (selected) return; // don't collapse while placing
                  setCollapsedWaves((prev) => { const next = new Set(prev); if (next.has(w)) next.delete(w); else next.add(w); return next; });
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">Wave {w}</span>
                  <Badge variant="secondary" className="text-[10px] h-5">{waveTeams.length}/{numLanes}</Badge>
                  {hasDouble && <Badge className="text-[10px] h-5 bg-red-100 text-red-700 border-red-200">×2</Badge>}
                </div>
                {!selected && (isCollapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />)}
              </button>

              {!isCollapsed && (
                <div className="px-3 pb-3 space-y-2">
                  {Array.from({ length: numLanes }, (_, li) => li + 1).map((l) => {
                    const t = teams.find((x) => x.wave === w && x.lane === l);
                    const isSelected = selected === t?.id;
                    const isDropTarget = !!selected && !isSelected;
                    const dGt = !!t?.driver_id && goingTwiceIds.has(t.driver_id);
                    const cGt = !!t?.crew_id && goingTwiceIds.has(t.crew_id);
                    return (
                      <div
                        key={l}
                        className={[
                          "rounded-xl border transition-all",
                          isSelected ? "border-primary ring-2 ring-primary/40 bg-primary/5" : "",
                          isDropTarget && t ? "border-primary/60 bg-primary/5" : "",
                          isDropTarget && !t ? "border-primary border-dashed bg-primary/10" : "",
                          !isSelected && !isDropTarget ? "border-border" : "",
                        ].join(" ")}
                      >
                        <div className="flex items-center gap-2 p-3 min-h-[52px]">
                          <div
                            onClick={() => handleSlotTap(w, l)}
                            className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer select-none"
                          >
                            <span className="text-[10px] font-bold text-muted-foreground/60 w-7 shrink-0">L{l}</span>
                            {t ? (
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div className="flex items-center gap-1 min-w-0">
                                    <Car className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                    <span className={`text-sm font-medium truncate ${dGt ? "text-red-600" : ""}`}>
                                      {dn(t.driver_id)}{dGt && " ×2"}
                                    </span>
                                  </div>
                                  <span className="text-muted-foreground/40 text-xs">+</span>
                                  <div className="flex items-center gap-1 min-w-0">
                                    <UserCheck className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                    <span className={`text-sm font-medium truncate ${cGt ? "text-red-600" : ""}`}>
                                      {dn(t.crew_id)}{cGt && " ×2"}
                                    </span>
                                  </div>
                                </div>
                                {patientsEnabled && (
                                  <div className="flex items-center gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
                                    <HeartPulse className="h-3 w-3 text-purple-500 shrink-0" />
                                    <Select value={t.patient_id ?? "__none"} onValueChange={(v) => setPatient(t.id, v === "__none" ? null : v)}>
                                      <SelectTrigger className="h-7 text-xs border-0 p-0 bg-transparent focus:ring-0"><SelectValue placeholder="Patient…" /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="__none">— No patient —</SelectItem>
                                        {goingIds.filter((id) => members[id]).map((id) => <SelectItem key={id} value={id}>{dn(id)}</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex-1">
                                <span className={`text-sm ${isDropTarget ? "text-primary font-medium" : "text-muted-foreground/40"}`}>
                                  {isDropTarget ? "Tap to place here" : "Empty"}
                                </span>
                              </div>
                            )}
                          </div>
                          {t && !selected && (
                            <div className="flex gap-1 shrink-0">
                              <button type="button" onClick={() => moveToSlot(t.id, null, null)} className="p-1.5 text-muted-foreground/50 hover:text-muted-foreground rounded-lg hover:bg-muted">
                                <ChevronDown className="h-3.5 w-3.5" />
                              </button>
                              <button type="button" onClick={() => removeTeam(t.id)} className="p-1.5 text-muted-foreground/50 hover:text-destructive rounded-lg hover:bg-muted">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* ── Unmatched members ── */}
      {unpairedMembers.length > 0 && (
        <Card className="p-3 border-amber-200 bg-amber-50/50 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" /> Not in any team ({unpairedMembers.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {unpairedMembers.map((id) => (
              <span key={id} className="text-xs bg-amber-100 border border-amber-200 text-amber-900 rounded-full px-2 py-0.5">{dn(id)}</span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function StatTile({ icon: Icon, label, value, color = "default" }: {
  icon: typeof Users; label: string; value: number; color?: "default" | "green" | "amber" | "red";
}) {
  const tone = { default: "bg-card", green: "bg-green-50 border-green-200", amber: "bg-amber-50 border-amber-200", red: "bg-red-50 border-red-200" }[color];
  const ic = { default: "text-muted-foreground", green: "text-green-600", amber: "text-amber-600", red: "text-red-600" }[color];
  return (
    <Card className={`p-2.5 ${tone}`}>
      <div className="flex items-center gap-1 mb-1"><Icon className={`h-3.5 w-3.5 ${ic}`} /><span className="text-[10px] text-muted-foreground">{label}</span></div>
      <div className="text-xl font-bold">{value}</div>
    </Card>
  );
}
