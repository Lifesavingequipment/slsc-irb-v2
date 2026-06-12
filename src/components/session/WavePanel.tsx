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
import { buildNameMap } from "@/lib/names";

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
type Member = { id: string; full_name: string };
type Cfg = { waves_count: number; lanes_count: number };

const MAX_W = 4;
const MAX_L = 5;

function waveOptions(teamCount: number) {
  const opts: { waves: number; lanes: number; waste: number }[] = [];
  for (let w = 1; w <= MAX_W; w++) {
    for (let l = 1; l <= MAX_L; l++) {
      if (w * l >= teamCount) opts.push({ waves: w, lanes: l, waste: w * l - teamCount });
    }
  }
  opts.sort((a, b) => a.waves - b.waves || a.lanes - b.lanes || a.waste - b.waste);
  const seen = new Set<string>();
  return opts.filter((o) => {
    const k = `${o.waves}x${o.lanes}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function WavePanel({
  sessionId, clubId, sessionTitle, sessionStartsAt, goingIds, canManage,
}: Props) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [members, setMembers] = useState<Record<string, Member>>({});
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [pairFor, setPairFor] = useState<Member | null>(null);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    const [{ data: t }, { data: p }, { data: c }, { data: profs }] = await Promise.all([
      supabase.from("session_teams").select("*").eq("session_id", sessionId),
      supabase.from("member_partners").select("driver_id, crew_id").eq("club_id", clubId),
      supabase.from("session_draw_configs").select("waves_count, lanes_count").eq("session_id", sessionId).maybeSingle(),
      supabase.from("profiles").select("id, full_name").in("id", goingIds.length ? goingIds : ["00000000-0000-0000-0000-000000000000"]),
    ]);
    setTeams((t ?? []) as Team[]);
    setPartners((p ?? []) as Partner[]);
    setCfg((c as Cfg | null) ?? null);
    const map: Record<string, Member> = {};
    (profs ?? []).forEach((r: any) => { map[r.id] = { id: r.id, full_name: r.full_name ?? "Member" }; });
    setMembers(map);
  }, [sessionId, clubId, goingIds]);

  useEffect(() => { load(); }, [load]);

  const displayMap = useMemo(
    () => buildNameMap(Object.values(members)),
    [members],
  );
  const dn = (id: string | null | undefined) => (id && displayMap[id]) || "—";
  const name = (id: string | null) => dn(id);
  const teamLabel = (t: Team) => {
    const d = t.driver_id ? dn(t.driver_id) : null;
    const c = t.crew_id ? dn(t.crew_id) : null;
    if (d && c) return `${d} + ${c}`;
    return d || c || "Empty";
  };

  // Members in any team already
  const inTeamIds = useMemo(() => {
    const s = new Set<string>();
    teams.forEach((t) => { if (t.driver_id) s.add(t.driver_id); if (t.crew_id) s.add(t.crew_id); });
    return s;
  }, [teams]);

  const goingSet = useMemo(() => new Set(goingIds), [goingIds]);
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
      if (used.has(p.driver_id) || used.has(p.crew_id)) continue;
      if (!goingSet.has(p.driver_id) || !goingSet.has(p.crew_id)) continue;
      toInsert.push({ session_id: sessionId, driver_id: p.driver_id, crew_id: p.crew_id });
      used.add(p.driver_id);
      used.add(p.crew_id);
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

  // ── Auto-pair: confirmed partner pairs first, then pair leftovers ──
  const autoPair = async () => {
    setBusy(true);
    const used = new Set<string>(inTeamIds);
    const inserts: { session_id: string; driver_id: string | null; crew_id: string | null }[] = [];

    // 1) Confirmed partner pairs where both are Going
    for (const p of partners) {
      if (used.has(p.driver_id) || used.has(p.crew_id)) continue;
      if (!goingSet.has(p.driver_id) || !goingSet.has(p.crew_id)) continue;
      inserts.push({ session_id: sessionId, driver_id: p.driver_id, crew_id: p.crew_id });
      used.add(p.driver_id);
      used.add(p.crew_id);
    }

    // 2) Pair whoever's still unpartnered
    const pool = goingIds.filter((id) => !used.has(id));
    for (let i = 0; i + 1 < pool.length; i += 2) {
      inserts.push({ session_id: sessionId, driver_id: pool[i], crew_id: pool[i + 1] });
    }
    if (pool.length % 2 === 1) {
      inserts.push({ session_id: sessionId, driver_id: pool[pool.length - 1], crew_id: null });
    }

    if (!inserts.length) { setBusy(false); toast.info("Nothing to pair."); return; }
    const { error } = await supabase.from("session_teams").insert(inserts);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Added ${inserts.length} team${inserts.length === 1 ? "" : "s"}.`);
    load();
  };

  // ── Manual pair ──
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

  // ── Going twice: clone an existing team's crew slot with a different member ──
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

  // ── Move/swap a team into a slot (or to bench) ──
  const moveToSlot = async (teamId: string, wave: number | null, lane: number | null) => {
    const moving = teams.find((t) => t.id === teamId);
    if (!moving) return;
    const occupant = wave != null && lane != null
      ? teams.find((t) => t.wave === wave && t.lane === lane && t.id !== teamId)
      : null;

    // Validation: no person can crew/drive in two teams in the same wave.
    if (wave != null) {
      const peopleInWave = new Set<string>();
      teams.forEach((t) => {
        if (t.wave !== wave) return;
        if (t.id === teamId) return;
        if (occupant && t.id === occupant.id) return; // occupant will move out
        if (t.driver_id) peopleInWave.add(t.driver_id);
        if (t.crew_id) peopleInWave.add(t.crew_id);
      });
      const dupes: string[] = [];
      if (moving.driver_id && peopleInWave.has(moving.driver_id)) dupes.push(dn(moving.driver_id));
      if (moving.crew_id && peopleInWave.has(moving.crew_id)) dupes.push(dn(moving.crew_id));
      if (dupes.length) {
        toast.error(`${dupes.join(" and ")} already in wave ${wave}. Move them out first.`);
        return;
      }
    }

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
            teamLabel={teamLabel}
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

  const opts = waveOptions(teams.length);
  const overCapacity = cfg && teams.length > cfg.waves_count * cfg.lanes_count;

  return (
    <div className="space-y-4">
      {/* Stats + actions */}
      <Card className="p-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-2 text-xs">
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
        <p className="text-[11px] text-muted-foreground">
          "Confirmed pairs" adds a team for each saved partner pair where both are Going. "Auto-pair" does that first, then pairs whoever's left.
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
      <Card className="p-3 space-y-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Wave configuration</div>
        {teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add teams first to choose a wave layout.</p>
        ) : opts.length === 0 ? (
          <p className="text-sm text-destructive">Too many teams — max {MAX_W * MAX_L}. Remove some.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {opts.slice(0, 6).map((o) => {
              const active = cfg?.waves_count === o.waves && cfg?.lanes_count === o.lanes;
              return (
                <Button
                  key={`${o.waves}x${o.lanes}`}
                  variant={active ? "default" : "outline"}
                  onClick={() => setConfig(o.waves, o.lanes)}
                  disabled={busy}
                  className="h-auto py-2 flex-col gap-0.5"
                >
                  <div className="font-semibold text-sm leading-tight">
                    {o.waves} {o.waves === 1 ? "wave" : "waves"} × {o.lanes} {o.lanes === 1 ? "lane" : "lanes"}
                  </div>
                  <div className="text-[10px] opacity-70">
                    {o.waves * o.lanes} slots · {o.waste === 0 ? "perfect fit" : `${o.waste} empty`}
                  </div>
                </Button>
              );
            })}
          </div>
        )}
        {overCapacity && (
          <p className="text-xs text-destructive">More teams than slots — increase config or remove teams.</p>
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
            <p className="text-xs text-accent">Tap a slot to place — taps swap with whatever's there.</p>
          )}
          <WaveGrid
            cfg={cfg}
            teams={teams}
            teamLabel={teamLabel}
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
                label={teamLabel(t)}
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
    </div>
  );
}

function WaveGrid({
  cfg, teams, teamLabel, selectedTeamId, onSelect, onMove, readOnly,
}: {
  cfg: Cfg;
  teams: Team[];
  teamLabel: (t: Team) => string;
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
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cfg.lanes_count}, minmax(0, 1fr))` }}>
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
                      "min-h-[56px] rounded-lg border p-2 text-left text-xs transition-colors",
                      t
                        ? isSelected
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card hover:bg-accent/10"
                        : placing
                        ? "bg-accent/10 border-dashed border-accent"
                        : "bg-muted/30 border-dashed",
                    ].join(" ")}
                  >
                    <div className="text-[9px] opacity-60 mb-0.5">L{l}</div>
                    <div className="font-medium leading-tight break-words">{t ? teamLabel(t) : "—"}</div>
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
  team, label, selected, onSelect, onRemove,
}: {
  team: Team; label: string; selected: boolean;
  onSelect: () => void; onRemove: () => void;
}) {
  return (
    <div
      className={[
        "rounded-lg border p-2 text-xs flex items-center justify-between gap-1",
        selected ? "bg-primary text-primary-foreground border-primary" : "bg-card",
      ].join(" ")}
    >
      <button type="button" onClick={onSelect} className="flex-1 text-left font-medium truncate">
        {label}
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
      // Already on a team — adding target makes that person "going twice".
      // Reuse goingTwice path: creates a new team with that person's driver + target as crew.
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
