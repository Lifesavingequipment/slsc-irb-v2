import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/lib/confirm";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock, Share2, Shuffle, Trash2, Users, X, Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { buildNameMap, memberFullName } from "@/lib/names";

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
  wave: number | null;
  lane: number | null;
  notes: string | null;
};
type Partner = { driver_id: string; crew_id: string };
type Member = { id: string; display_name: string; auth_user_id: string | null; driver_flag: boolean; crew_flag: boolean; patient_flag: boolean };
type Cfg = { waves_count: number; lanes_count: number };

const MAX_W = 8;
const MAX_L = 8;

function recommendLayout(numTeams: number, maxWaves: number, maxLanes: number) {
  if (numTeams === 0) return null;
  let best: { waves: number; lanes: number; empty: number } | null = null;
  for (let w = 1; w <= maxWaves; w++) {
    for (let l = 1; l <= maxLanes; l++) {
      const slots = w * l;
      if (slots < numTeams) continue;
      const empty = slots - numTeams;
      if (!best || empty < best.empty || (empty === best.empty && w * l < best.waves * best.lanes)) {
        best = { waves: w, lanes: l, empty };
      }
    }
  }
  return best;
}

export function WavePanel({
  sessionId, clubId, sessionTitle, sessionStartsAt, goingIds, canManage,
}: Props) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [members, setMembers] = useState<Record<string, Member>>({});
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [maxWaves, setMaxWaves] = useState(MAX_W);
  const [maxLanes, setMaxLanes] = useState(MAX_L);
  const [busy, setBusy] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [pairFor, setPairFor] = useState<Member | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
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
    (profs ?? []).forEach((m) => { map[m.id] = { id: m.id, auth_user_id: m.auth_user_id ?? null, display_name: memberFullName(m, "Member"), driver_flag: m.driver_flag ?? false, crew_flag: m.crew_flag ?? false, patient_flag: m.patient_flag ?? false }; });
    setMembers(map);
  }, [sessionId, clubId, goingIds]);

  useEffect(() => { load(); }, [load]);

  const displayMap = useMemo(
    () => buildNameMap(Object.values(members).map((m) => ({ id: m.id, full_name: m.display_name }))),
    [members],
  );
  const dn = (id: string | null | undefined) => (id && displayMap[id]) || "—";

  const teamLabel = (t: Team) => {
    const d = t.driver_id ? dn(t.driver_id) : null;
    const c = t.crew_id ? dn(t.crew_id) : null;
    if (d && c) return `${d} + ${c}`;
    return d || c || "Empty";
  };

  // How many teams each member appears in (for ×2 indicator)
  const memberTeamCount = useMemo(() => {
    const counts: Record<string, number> = {};
    teams.forEach((t) => {
      if (t.driver_id) counts[t.driver_id] = (counts[t.driver_id] ?? 0) + 1;
      if (t.crew_id) counts[t.crew_id] = (counts[t.crew_id] ?? 0) + 1;
    });
    return counts;
  }, [teams]);

  // Members in any team already (at least one team = "partnered")
  const inTeamIds = useMemo(() => {
    const s = new Set<string>();
    teams.forEach((t) => { if (t.driver_id) s.add(t.driver_id); if (t.crew_id) s.add(t.crew_id); });
    return s;
  }, [teams]);

  const goingSet = useMemo(() => new Set(goingIds), [goingIds]);

  // Translate auth_user_id → members.id for partner matching
  const authToMemberId = useMemo(() => {
    const m: Record<string, string> = {};
    Object.values(members).forEach((mem) => { if (mem.auth_user_id) m[mem.auth_user_id] = mem.id; });
    return m;
  }, [members]);

  const unpartnered = useMemo(
    () => goingIds
      .filter((id) => !inTeamIds.has(id))
      .map((id) => members[id])
      .filter(Boolean)
      .slice()
      .sort((a, b) => dn(a.id).localeCompare(dn(b.id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goingIds, inTeamIds, members, displayMap],
  );

  const placedTeams = useMemo(
    () => teams.filter((t) => t.wave != null && t.lane != null),
    [teams],
  );
  const benchTeams = useMemo(
    () => teams.filter((t) => t.wave == null || t.lane == null),
    [teams],
  );

  // ── Build confirmed teams from partner pairs ──
  const buildConfirmed = async () => {
    setBusy(true);
    const toInsert: { session_id: string; driver_id: string; crew_id: string }[] = [];
    const used = new Set<string>(inTeamIds);
    for (const p of partners) {
      const driverId = authToMemberId[p.driver_id] ?? p.driver_id;
      const crewId = authToMemberId[p.crew_id] ?? p.crew_id;
      if (used.has(driverId) || used.has(crewId)) continue;
      if (!goingSet.has(driverId) || !goingSet.has(crewId)) continue;
      toInsert.push({ session_id: sessionId, driver_id: driverId, crew_id: crewId });
      used.add(driverId);
      used.add(crewId);
    }
    if (toInsert.length === 0) {
      setBusy(false);
      toast.info("No new partner pairs to add.");
      return;
    }
    const { error } = await supabase.from("session_teams").insert(toInsert);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Added ${toInsert.length} confirmed team${toInsert.length === 1 ? "" : "s"}.`);
    load();
  };

  // ── Auto-pair ──
  const autoPair = async () => {
    setBusy(true);
    const used = new Set<string>(inTeamIds);
    const inserts: { session_id: string; driver_id: string | null; crew_id: string | null }[] = [];

    // First: apply any confirmed partner pairs
    for (const p of partners) {
      const driverId = authToMemberId[p.driver_id] ?? p.driver_id;
      const crewId = authToMemberId[p.crew_id] ?? p.crew_id;
      if (used.has(driverId) || used.has(crewId)) continue;
      if (!goingSet.has(driverId) || !goingSet.has(crewId)) continue;
      inserts.push({ session_id: sessionId, driver_id: driverId, crew_id: crewId });
      used.add(driverId);
      used.add(crewId);
    }

    // Remaining unpaired members — split by role flags
    const remaining = goingIds.filter((id) => !used.has(id));
    const bothFlags = remaining.filter((id) => members[id]?.driver_flag && members[id]?.crew_flag);
    const driversOnly = remaining.filter((id) => members[id]?.driver_flag && !members[id]?.crew_flag);
    const crewOnly = remaining.filter((id) => !members[id]?.driver_flag && members[id]?.crew_flag);
    const neither = remaining.filter((id) => id in members && !members[id]?.driver_flag && !members[id]?.crew_flag);

    // Build driver pool: drivers-only first, then dual-role
    const driverPool = [...driversOnly, ...bothFlags];
    // Build crew pool: crew-only first, then dual-role (those not used as driver)
    const usedAsDual = new Set<string>();

    const availableCrew = () => [
      ...crewOnly.filter((id) => !used.has(id)),
      ...bothFlags.filter((id) => !used.has(id) && !usedAsDual.has(id)),
    ];

    for (const driverId of driverPool) {
      if (used.has(driverId)) continue;
      const crewList = availableCrew();
      if (crewList.length === 0) {
        // No crew available — add driver solo
        inserts.push({ session_id: sessionId, driver_id: driverId, crew_id: null });
        used.add(driverId);
        if (bothFlags.includes(driverId)) usedAsDual.add(driverId);
        continue;
      }
      const crewId = crewList[0];
      inserts.push({ session_id: sessionId, driver_id: driverId, crew_id: crewId });
      used.add(driverId);
      used.add(crewId);
      if (bothFlags.includes(driverId)) usedAsDual.add(driverId);
    }

    // Remaining crew-only with no driver — add solo
    for (const crewId of crewOnly) {
      if (used.has(crewId)) continue;
      inserts.push({ session_id: sessionId, driver_id: null, crew_id: crewId });
      used.add(crewId);
    }

    // Members with no role flags — pair them together
    const neitherPool = neither.filter((id) => !used.has(id));
    for (let i = 0; i + 1 < neitherPool.length; i += 2) {
      inserts.push({ session_id: sessionId, driver_id: neitherPool[i], crew_id: neitherPool[i + 1] });
    }
    if (neitherPool.length % 2 === 1) {
      inserts.push({ session_id: sessionId, driver_id: neitherPool[neitherPool.length - 1], crew_id: null });
    }

    // Guard: drop any row where the ID isn't a valid member (catches stale RSVPs with auth_user_ids)
    const safeInserts = inserts.filter((row) =>
      (row.driver_id == null || row.driver_id in members) &&
      (row.crew_id == null || row.crew_id in members),
    );
    if (!safeInserts.length) { setBusy(false); toast.info("Nothing to pair."); return; }
    const { error } = await supabase.from("session_teams").insert(safeInserts);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Added ${safeInserts.length} team${safeInserts.length === 1 ? "" : "s"}.`);
    load();
  };

  // ── Manual pair (from unpartnered list) ──
  const manualPair = async (driverId: string, crewId: string | null) => {
    setBusy(true);
    const { error } = await supabase.from("session_teams").insert({
      session_id: sessionId, driver_id: driverId, crew_id: crewId,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setPairFor(null);
    load();
  };

  // ── Going twice: pair an already-assigned member with this member ──
  const goingTwice = async (memberId: string, withTeam: Team) => {
    setBusy(true);
    const { error } = await supabase.from("session_teams").insert({
      session_id: sessionId,
      driver_id: withTeam.driver_id,
      crew_id: memberId,
      notes: "going twice",
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setPairFor(null);
    load();
  };

  // ── Create team (free-form, no restrictions) ──
  const createTeam = async (driverId: string | null, crewId: string | null) => {
    setBusy(true);
    const { error } = await supabase.from("session_teams").insert({
      session_id: sessionId, driver_id: driverId, crew_id: crewId,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setCreateOpen(false);
    load();
  };

  // ── Remove team ──
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
    if (error) { toast.error(error.message); return; }
    if (selectedTeamId === id) setSelectedTeamId(null);
    toast.success("Team removed");
    load();
  };

  const clearAll = async () => {
    const ok = await confirm({
      title: "Clear all teams?",
      description: "Every lane assignment for this session will be removed.",
      confirmText: "Clear all",
    });
    if (!ok) return;
    const { error } = await supabase.from("session_teams").delete().eq("session_id", sessionId);
    if (error) { toast.error(error.message); return; }
    setSelectedTeamId(null);
    load();
  };

  // ── Wave config ──
  const setConfig = async (waves: number, lanes: number) => {
    setBusy(true);
    const { error } = await supabase.from("session_draw_configs")
      .upsert({ session_id: sessionId, waves_count: waves, lanes_count: lanes }, { onConflict: "session_id" });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setCfg({ waves_count: waves, lanes_count: lanes });
  };

  // ── Move/swap a team into a slot — no duplicate-person restriction ──
  const moveToSlot = async (teamId: string, wave: number | null, lane: number | null) => {
    const moving = teams.find((t) => t.id === teamId);
    if (!moving) return;
    const occupant = wave != null && lane != null
      ? teams.find((t) => t.wave === wave && t.lane === lane && t.id !== teamId)
      : null;

    // Two-step swap to avoid unique-index collision: park occupant to NULL first.
    setBusy(true);
    if (occupant) {
      const { error: e1 } = await supabase.from("session_teams")
        .update({ wave: null, lane: null }).eq("id", occupant.id);
      if (e1) { setBusy(false); toast.error(e1.message); return; }
    }
    const { error: e2 } = await supabase.from("session_teams")
      .update({ wave, lane }).eq("id", teamId);
    if (e2) { setBusy(false); toast.error(e2.message); return; }
    if (occupant && moving.wave != null && moving.lane != null) {
      const { error: e3 } = await supabase.from("session_teams")
        .update({ wave: moving.wave, lane: moving.lane }).eq("id", occupant.id);
      if (e3) { setBusy(false); toast.error(e3.message); return; }
    }
    setBusy(false);
    setSelectedTeamId(null);
    load();
  };

  // ── Share text ──
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
      lines.push(`${teams.length} team${teams.length === 1 ? "" : "s"} (no wave config)`);
      teams.forEach((t) => lines.push(`  • ${teamLabel(t)}`));
    }
    if (unpartnered.length) {
      lines.push("");
      lines.push(`⚠ Unpartnered: ${unpartnered.map((m) => dn(m.id)).join(", ")}`);
    }
    const text = lines.join("\n");
    try {
      if (navigator.share) await navigator.share({ text, title: sessionTitle });
      else { await navigator.clipboard.writeText(text); toast.success("Copied to clipboard"); }
    } catch { /* user cancelled */ }
  };

  // ── Read-only view ──
  if (!canManage) {
    return (
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Lock className="h-4 w-4" /> Wave Draw (view only)
        </div>
        {cfg && placedTeams.length > 0 ? (
          <WaveGrid
            cfg={cfg}
            teams={teams}
            nameOf={dn}
            memberTeamCount={memberTeamCount}
            selectedTeamId={null}
            onSelect={() => {}}
            onMove={() => {}}
            readOnly
          />
        ) : (
          <p className="text-sm text-muted-foreground">No draw published yet.</p>
        )}
      </Card>
    );
  }

  const overCapacity = cfg && teams.length > cfg.waves_count * cfg.lanes_count;

  return (
    <div className="space-y-4">
      {/* Stats + actions */}
      <Card className="p-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-2 text-xs flex-wrap">
            <Badge variant="secondary"><Users className="h-3 w-3 mr-1" />{goingIds.length} going</Badge>
            <Badge variant="secondary">{teams.length} teams</Badge>
            {unpartnered.length > 0 && (
              <Badge className="bg-warning text-warning-foreground">{unpartnered.length} unpartnered</Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={shareDraw} disabled={busy}>
              <Share2 className="h-3.5 w-3.5 mr-1" />Share
            </Button>
            {teams.length > 0 && (
              <Button size="sm" variant="outline" onClick={clearAll} disabled={busy} className="text-destructive">
                <Trash2 className="h-3.5 w-3.5 mr-1" />Clear
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Build / auto-pair */}
      <Card className="p-3 space-y-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Build teams</div>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={buildConfirmed} disabled={busy || goingIds.length === 0} variant="secondary">
            <Plus className="h-4 w-4 mr-1" />Confirmed pairs
          </Button>
          <Button onClick={autoPair} disabled={busy || goingIds.length === 0}>
            <Shuffle className="h-4 w-4 mr-1" />Auto-pair
          </Button>
        </div>
        <Button
          variant="outline"
          className="w-full"
          disabled={busy || goingIds.length === 0}
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1" />Create team
        </Button>
        <p className="text-[11px] text-muted-foreground">
          "Confirmed pairs" adds saved partner pairs where both are going. "Auto-pair" pairs everyone. "Create team" lets you pick any driver and crew, including those already in another team.
        </p>
      </Card>

      {/* Unpartnered */}
      {unpartnered.length > 0 && (
        <Card className="p-3 space-y-2">
          <div className="text-xs font-semibold text-warning uppercase tracking-wide">
            ⚠ Unpartnered ({unpartnered.length})
          </div>
          <div className="space-y-1.5">
            {unpartnered.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border bg-card p-2">
                <span className="text-sm truncate">{dn(m.id)}</span>
                <Button size="sm" variant="outline" onClick={() => setPairFor(m)}>Pair…</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Wave config */}
      <Card className="p-3 space-y-3">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Wave configuration</div>
        {teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add teams first to choose a wave layout.</p>
        ) : (
          <>
            {/* Step 1: capacity */}
            <div>
              <div className="text-[11px] text-muted-foreground mb-1.5">Your available capacity</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-[11px] text-muted-foreground">Max waves</div>
                  <Select
                    value={String(maxWaves)}
                    onValueChange={(v) => {
                      const w = Number(v);
                      setMaxWaves(w);
                      if (cfg && cfg.waves_count > w) setConfig(w, cfg.lanes_count);
                    }}
                    disabled={busy}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: MAX_W }, (_, i) => i + 1).map((n) => (
                        <SelectItem key={n} value={String(n)}>{n} {n === 1 ? "wave" : "waves"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] text-muted-foreground">Max lanes per wave</div>
                  <Select
                    value={String(maxLanes)}
                    onValueChange={(v) => {
                      const l = Number(v);
                      setMaxLanes(l);
                      if (cfg && cfg.lanes_count > l) setConfig(cfg.waves_count, l);
                    }}
                    disabled={busy}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: MAX_L }, (_, i) => i + 1).map((n) => (
                        <SelectItem key={n} value={String(n)}>{n} {n === 1 ? "lane" : "lanes"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Recommendation */}
            {(() => {
              const rec = recommendLayout(teams.length, maxWaves, maxLanes);
              if (!rec) return (
                <p className="text-[11px] text-destructive">
                  No layout fits {teams.length} teams within {maxWaves} waves × {maxLanes} lanes. Increase capacity or remove teams.
                </p>
              );
              const slots = rec.waves * rec.lanes;
              return (
                <div className="rounded-md bg-accent/10 border border-accent/20 px-3 py-2 text-[11px] text-accent space-y-0.5">
                  <div className="font-semibold">Recommended: {rec.waves} {rec.waves === 1 ? "wave" : "waves"} × {rec.lanes} {rec.lanes === 1 ? "lane" : "lanes"}</div>
                  <div className="opacity-80">
                    {slots} slots · {rec.empty === 0 ? "perfect fit" : `${rec.empty} empty ${rec.empty === 1 ? "slot" : "slots"}`}
                  </div>
                  {(!cfg || cfg.waves_count !== rec.waves || cfg.lanes_count !== rec.lanes) && (
                    <button
                      type="button"
                      className="mt-1 underline underline-offset-2 font-medium"
                      onClick={() => setConfig(rec.waves, rec.lanes)}
                    >
                      Use this layout
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Step 2: override layout */}
            <div>
              <div className="text-[11px] text-muted-foreground mb-1.5">Chosen layout</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-[11px] text-muted-foreground">Waves</div>
                  <Select
                    value={cfg ? String(cfg.waves_count) : ""}
                    onValueChange={(v) => setConfig(Number(v), cfg?.lanes_count ?? 1)}
                    disabled={busy}
                  >
                    <SelectTrigger className="h-9"><SelectValue placeholder="Choose…" /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: maxWaves }, (_, i) => i + 1).map((n) => (
                        <SelectItem key={n} value={String(n)}>{n} {n === 1 ? "wave" : "waves"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] text-muted-foreground">Lanes per wave</div>
                  <Select
                    value={cfg ? String(cfg.lanes_count) : ""}
                    onValueChange={(v) => setConfig(cfg?.waves_count ?? 1, Number(v))}
                    disabled={busy}
                  >
                    <SelectTrigger className="h-9"><SelectValue placeholder="Choose…" /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: maxLanes }, (_, i) => i + 1).map((n) => (
                        <SelectItem key={n} value={String(n)}>{n} {n === 1 ? "lane" : "lanes"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {cfg && (
              <div className="text-[11px] text-muted-foreground">
                {cfg.waves_count * cfg.lanes_count} slots · {teams.length} teams
                {overCapacity
                  ? <span className="text-destructive ml-1">— more teams than slots</span>
                  : teams.length < cfg.waves_count * cfg.lanes_count
                  ? <span className="ml-1">· {cfg.waves_count * cfg.lanes_count - teams.length} empty</span>
                  : <span className="ml-1">· perfect fit</span>
                }
              </div>
            )}
          </>
        )}
      </Card>

      {/* Grid */}
      {cfg && (
        <Card className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Wave grid</div>
            {selectedTeamId && (
              <Button size="sm" variant="ghost" onClick={() => setSelectedTeamId(null)}>
                <X className="h-3.5 w-3.5 mr-1" />Deselect
              </Button>
            )}
          </div>
          {selectedTeamId && (
            <p className="text-xs text-accent">Tap a slot to place — taps occupied slots swap the two teams.</p>
          )}
          <WaveGrid
            cfg={cfg}
            teams={teams}
            nameOf={dn}
            memberTeamCount={memberTeamCount}
            selectedTeamId={selectedTeamId}
            onSelect={(id) => setSelectedTeamId((cur) => (cur === id ? null : id))}
            onMove={moveToSlot}
          />
        </Card>
      )}

      {/* Bench */}
      {benchTeams.length > 0 && (
        <Card className="p-3 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Bench ({benchTeams.length})
          </div>
          <div className="grid grid-cols-2 gap-2">
            {benchTeams.map((t) => (
              <TeamChip
                key={t.id}
                team={t}
                nameOf={dn}
                memberTeamCount={memberTeamCount}
                selected={selectedTeamId === t.id}
                onSelect={() => setSelectedTeamId((cur) => (cur === t.id ? null : t.id))}
                onRemove={() => removeTeam(t.id)}
              />
            ))}
          </div>
          {selectedTeamId && cfg && (
            <Button size="sm" variant="outline" className="w-full" onClick={() => moveToSlot(selectedTeamId, null, null)}>
              Move selected to bench
            </Button>
          )}
        </Card>
      )}

      {/* Pair dialog */}
      <Dialog open={!!pairFor} onOpenChange={(o) => !o && setPairFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Pair {pairFor ? dn(pairFor.id) : ""}</DialogTitle></DialogHeader>
          {pairFor && (
            <PairForm
              target={pairFor}
              candidates={goingIds
                .filter((id) => id !== pairFor.id && members[id])
                .map((id) => {
                  const teamsWith = teams.filter((t) => t.driver_id === id || t.crew_id === id);
                  return { member: members[id], teams: teamsWith };
                })}
              teamLabel={teamLabel}
              nameOf={dn}
              onPair={(crewId) => manualPair(pairFor.id, crewId)}
              onSolo={() => manualPair(pairFor.id, null)}
              onGoingTwice={(team) => goingTwice(pairFor.id, team)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Create team dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create team</DialogTitle></DialogHeader>
          <CreateTeamForm
            goingIds={goingIds}
            members={members}
            memberTeamCount={memberTeamCount}
            nameOf={dn}
            busy={busy}
            onCreate={createTeam}
            onCancel={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Name with optional ×2 badge ──
function NameBadge({ name, count }: { name: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span>{name}</span>
      {count >= 2 && (
        <span className="ml-0.5 inline-block text-[9px] font-bold bg-warning/30 text-warning-foreground rounded px-0.5 leading-tight">
          ×{count}
        </span>
      )}
    </span>
  );
}

function WaveGrid({
  cfg, teams, nameOf, memberTeamCount, selectedTeamId, onSelect, onMove, readOnly,
}: {
  cfg: Cfg;
  teams: Team[];
  nameOf: (id: string | null | undefined) => string;
  memberTeamCount: Record<string, number>;
  selectedTeamId: string | null;
  onSelect: (id: string) => void;
  onMove: (teamId: string, wave: number | null, lane: number | null) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-3">
      {Array.from({ length: cfg.waves_count }).map((_, wi) => {
        const w = wi + 1;
        return (
          <div key={w}>
            <div className="text-[10px] font-bold uppercase tracking-wide text-accent mb-1.5">Wave {w}</div>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(cfg.lanes_count, 5)}, minmax(0, 1fr))` }}>
              {Array.from({ length: cfg.lanes_count }).map((__, li) => {
                const l = li + 1;
                const t = teams.find((x) => x.wave === w && x.lane === l);
                const isSelected = t && selectedTeamId === t.id;
                const placing = !!selectedTeamId && !isSelected;
                return (
                  <button
                    key={l}
                    type="button"
                    disabled={readOnly}
                    onClick={() => {
                      if (readOnly) return;
                      if (selectedTeamId && (!t || t.id !== selectedTeamId)) {
                        onMove(selectedTeamId, w, l);
                      } else if (t) {
                        onSelect(t.id);
                      }
                    }}
                    className={[
                      "min-h-[64px] rounded-lg border p-2 text-left text-xs transition-colors",
                      t
                        ? isSelected
                          ? "bg-destructive/90 text-destructive-foreground border-destructive"
                          : "bg-card hover:bg-accent/10"
                        : placing
                        ? "bg-accent/10 border-dashed border-accent"
                        : "bg-muted/30 border-dashed",
                    ].join(" ")}
                  >
                    <div className="text-[9px] opacity-60 mb-0.5">L{l}</div>
                    {t ? (
                      <div className="space-y-0.5 leading-tight">
                        <div className="font-bold truncate">
                          <NameBadge name={nameOf(t.driver_id)} count={t.driver_id ? (memberTeamCount[t.driver_id] ?? 0) : 0} />
                        </div>
                        <div className="opacity-75 truncate">
                          <NameBadge name={nameOf(t.crew_id)} count={t.crew_id ? (memberTeamCount[t.crew_id] ?? 0) : 0} />
                        </div>
                      </div>
                    ) : (
                      <div className="opacity-40">—</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TeamChip({
  team, nameOf, memberTeamCount, selected, onSelect, onRemove,
}: {
  team: Team;
  nameOf: (id: string | null | undefined) => string;
  memberTeamCount: Record<string, number>;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={[
        "rounded-lg border p-2 text-xs flex items-center justify-between gap-1",
        selected ? "bg-destructive/90 text-destructive-foreground border-destructive" : "bg-card",
      ].join(" ")}
    >
      <button type="button" onClick={onSelect} className="flex-1 text-left space-y-0.5 leading-tight min-w-0">
        <div className="font-bold truncate">
          <NameBadge name={nameOf(team.driver_id)} count={team.driver_id ? (memberTeamCount[team.driver_id] ?? 0) : 0} />
        </div>
        <div className="opacity-75 truncate">
          <NameBadge name={nameOf(team.crew_id)} count={team.crew_id ? (memberTeamCount[team.crew_id] ?? 0) : 0} />
        </div>
        {team.notes ? <span className="ml-1 opacity-60">({team.notes})</span> : null}
      </button>
      <button type="button" onClick={onRemove} className="opacity-60 hover:opacity-100 shrink-0">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function PairForm({
  target, candidates, teamLabel, nameOf, onPair, onSolo, onGoingTwice,
}: {
  target: Member;
  candidates: { member: Member; teams: Team[] }[];
  teamLabel: (t: Team) => string;
  nameOf: (id: string) => string;
  onPair: (crewId: string) => void;
  onSolo: () => void;
  onGoingTwice: (team: Team) => void;
}) {
  const [pick, setPick] = useState<string>("");
  const chosen = candidates.find((c) => c.member.id === pick);
  const targetName = nameOf(target.id);

  const submit = () => {
    if (!chosen) return;
    if (chosen.teams.length === 0) {
      onPair(chosen.member.id);
    } else {
      onGoingTwice(chosen.teams[0]);
    }
  };

  return (
    <div className="space-y-4 text-sm">
      <div className="space-y-1.5">
        <div className="font-medium">Pair with anyone attending</div>
        <p className="text-xs text-muted-foreground">
          Unpaired members make a new team. Already-paired members will be marked as going twice.
        </p>
        <Select value={pick} onValueChange={setPick}>
          <SelectTrigger><SelectValue placeholder="Choose someone…" /></SelectTrigger>
          <SelectContent>
            {candidates.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No one else is going.</div>
            )}
            {candidates
              .slice()
              .sort((a, b) => nameOf(a.member.id).localeCompare(nameOf(b.member.id)))
              .map(({ member, teams }) => (
                <SelectItem key={member.id} value={member.id}>
                  <span className="flex items-center justify-between gap-3 w-full">
                    <span>{nameOf(member.id)}</span>
                    <span className={[
                      "text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded",
                      teams.length === 0
                        ? "bg-warning/20 text-warning-foreground"
                        : teams.length === 1
                        ? "bg-muted text-muted-foreground"
                        : "bg-accent/20 text-accent",
                    ].join(" ")}>
                      {teams.length === 0
                        ? "unpaired"
                        : teams.length === 1
                        ? `with ${teamLabel(teams[0])}`
                        : `going ${teams.length}×`}
                    </span>
                  </span>
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Button className="w-full" disabled={!chosen} onClick={submit}>
          {chosen && chosen.teams.length > 0
            ? `Add ${targetName} (going twice)`
            : `Pair ${targetName}`}
        </Button>
      </div>

      <div className="pt-2 border-t">
        <Button variant="outline" className="w-full" onClick={onSolo}>
          Add {targetName} as solo
        </Button>
      </div>
    </div>
  );
}

function CreateTeamForm({
  goingIds, members, memberTeamCount, nameOf, busy, onCreate, onCancel,
}: {
  goingIds: string[];
  members: Record<string, Member>;
  memberTeamCount: Record<string, number>;
  nameOf: (id: string) => string;
  busy: boolean;
  onCreate: (driverId: string | null, crewId: string | null) => void;
  onCancel: () => void;
}) {
  const [driverId, setDriverId] = useState<string>("");
  const [crewId, setCrewId] = useState<string>("");

  const sortedAttending = goingIds
    .filter((id) => members[id])
    .slice()
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

  const memberOption = (id: string) => {
    const count = memberTeamCount[id] ?? 0;
    return (
      <SelectItem key={id} value={id}>
        {nameOf(id)}{count > 0 ? ` (×${count + 1} if added)` : ""}
      </SelectItem>
    );
  };

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-muted-foreground">
        Any attending member can be selected. Members already in another team will be marked ×2.
      </p>
      <div className="space-y-1.5">
        <div className="font-medium text-xs uppercase text-muted-foreground">Driver</div>
        <Select value={driverId} onValueChange={setDriverId}>
          <SelectTrigger><SelectValue placeholder="Select driver…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">— No driver —</SelectItem>
            {sortedAttending.map(memberOption)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <div className="font-medium text-xs uppercase text-muted-foreground">Crew</div>
        <Select value={crewId} onValueChange={setCrewId}>
          <SelectTrigger><SelectValue placeholder="Select crew…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">— No crew —</SelectItem>
            {sortedAttending.map(memberOption)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 pt-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          className="flex-1"
          disabled={busy || (!driverId || driverId === "__none") && (!crewId || crewId === "__none")}
          onClick={() => onCreate(
            driverId && driverId !== "__none" ? driverId : null,
            crewId && crewId !== "__none" ? crewId : null,
          )}
        >
          Create team
        </Button>
      </div>
    </div>
  );
}
