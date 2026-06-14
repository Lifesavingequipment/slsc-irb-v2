import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "@/lib/confirm";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ChevronDown, ChevronUp, Clock, ListChecks, FolderOpen, BookmarkPlus } from "lucide-react";
import { toast } from "sonner";

type BlockDraft = {
  id?: string;
  position: number;
  title: string;
  duration_minutes: number | null;
  notes: string;
  drill_id: string | null;
};

type Drill = { id: string; name: string; description: string | null; default_duration_minutes: number | null };
type PlanTemplate = { id: string; name: string; blocks: any[] };

function emptyBlock(position: number): BlockDraft {
  return { position, title: "", duration_minutes: null, notes: "", drill_id: null };
}

export function TrainingPlanView({ sessionId }: { sessionId: string }) {
  const [overview, setOverview] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<(BlockDraft & { id: string; drill?: Drill | null })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: plan } = await supabase
        .from("session_training_plans").select("id, overview").eq("session_id", sessionId).maybeSingle();
      if (!plan) { setLoading(false); return; }
      setOverview(plan.overview ?? null);
      const { data: bs } = await supabase
        .from("session_training_blocks")
        .select("id, position, title, duration_minutes, notes, drill_id")
        .eq("plan_id", plan.id).order("position");
      const rows = (bs ?? []) as any[];
      const drillIds = Array.from(new Set(rows.map((r) => r.drill_id).filter(Boolean)));
      let drillMap = new Map<string, Drill>();
      if (drillIds.length > 0) {
        const { data: ds } = await supabase
          .from("training_drills").select("id, name, description, default_duration_minutes").in("id", drillIds);
        drillMap = new Map(((ds ?? []) as Drill[]).map((d) => [d.id, d]));
      }
      setBlocks(rows.map((r) => ({ ...r, drill: r.drill_id ? drillMap.get(r.drill_id) ?? null : null })));
      setLoading(false);
    })();
  }, [sessionId]);

  if (loading) return <Card className="p-4 text-sm text-muted-foreground">Loading…</Card>;
  if (!overview && blocks.length === 0) {
    return <Card className="p-4 text-sm text-muted-foreground">No training plan yet.</Card>;
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-primary" />
        <div className="font-semibold">Training plan</div>
      </div>
      {overview && <p className="text-sm whitespace-pre-wrap">{overview}</p>}
      <div className="space-y-2">
        {blocks.map((b, i) => (
          <div key={b.id} className="rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{i + 1}</Badge>
              <div className="font-medium text-sm flex-1">{b.title}</div>
              {b.duration_minutes && (
                <Badge variant="outline" className="gap-1">
                  <Clock className="h-3 w-3" /> {b.duration_minutes} min
                </Badge>
              )}
            </div>
            {b.notes && <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{b.notes}</p>}
            {b.drill && (
              <div className="mt-2 rounded bg-muted/40 p-2 text-xs">
                <div className="font-medium">Drill: {b.drill.name}</div>
                {b.drill.description && <div className="text-muted-foreground mt-0.5">{b.drill.description}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

export function TrainingPlanEditor({
  sessionId, clubId, canManageTemplates,
}: { sessionId: string; clubId: string; canManageTemplates: boolean }) {
  const [planId, setPlanId] = useState<string | null>(null);
  const [overview, setOverview] = useState("");
  const [blocks, setBlocks] = useState<BlockDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [drills, setDrills] = useState<Drill[]>([]);
  const [templates, setTemplates] = useState<PlanTemplate[]>([]);
  const [pickTpl, setPickTpl] = useState("");
  const confirm = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    const { data: plan } = await supabase
      .from("session_training_plans")
      .select("id, overview").eq("session_id", sessionId).maybeSingle();
    if (plan) {
      setPlanId(plan.id);
      setOverview(plan.overview ?? "");
      const { data: bs } = await supabase
        .from("session_training_blocks")
        .select("id, position, title, duration_minutes, notes, drill_id")
        .eq("plan_id", plan.id).order("position");
      setBlocks(((bs ?? []) as any[]).map((b) => ({
        id: b.id, position: b.position, title: b.title,
        duration_minutes: b.duration_minutes, notes: b.notes ?? "", drill_id: b.drill_id,
      })));
    } else {
      setPlanId(null); setOverview(""); setBlocks([]);
    }
    const { data: ds } = await supabase
      .from("training_drills").select("id, name, description, default_duration_minutes")
      .eq("club_id", clubId).order("name");
    setDrills((ds ?? []) as Drill[]);
    const { data: tpls } = await supabase
      .from("training_plan_templates").select("id, name, blocks").eq("club_id", clubId).order("name");
    setTemplates(((tpls ?? []) as any[]).map((t) => ({ id: t.id, name: t.name, blocks: t.blocks ?? [] })));
    setLoading(false);
  }, [sessionId, clubId]);

  useEffect(() => { load(); }, [load]);

  const update = (i: number, patch: Partial<BlockDraft>) =>
    setBlocks((bs) => bs.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const add = () => setBlocks((bs) => [...bs, emptyBlock(bs.length)]);
  const remove = async (i: number) => {
    const ok = await confirm({ title: "Are you sure?", description: "This cannot be undone." });
    if (!ok) return;
    setBlocks((bs) => bs.filter((_, idx) => idx !== i).map((b, idx) => ({ ...b, position: idx })));
  };
  const move = (i: number, dir: -1 | 1) => {
    setBlocks((bs) => {
      const j = i + dir;
      if (j < 0 || j >= bs.length) return bs;
      const next = [...bs];
      [next[i], next[j]] = [next[j], next[i]];
      return next.map((b, idx) => ({ ...b, position: idx }));
    });
  };

  const applyDrill = (i: number, drillId: string) => {
    const d = drills.find((x) => x.id === drillId);
    if (!d) { update(i, { drill_id: null }); return; }
    update(i, {
      drill_id: d.id,
      title: blocks[i].title || d.name,
      duration_minutes: blocks[i].duration_minutes ?? d.default_duration_minutes,
      notes: blocks[i].notes || (d.description ?? ""),
    });
  };

  const save = async () => {
    setBusy(true);
    let pid = planId;
    if (!pid) {
      const { data, error } = await supabase
        .from("session_training_plans")
        .insert({ session_id: sessionId, club_id: clubId, overview: overview.trim() || null })
        .select("id").single();
      if (error) { setBusy(false); toast.error(error.message); return; }
      pid = data!.id;
      setPlanId(pid);
    } else {
      await supabase.from("session_training_plans").update({ overview: overview.trim() || null }).eq("id", pid);
    }
    // Replace strategy for blocks
    await supabase.from("session_training_blocks").delete().eq("plan_id", pid);
    const rows = blocks
      .filter((b) => b.title.trim().length > 0)
      .map((b, idx) => ({
        plan_id: pid!, club_id: clubId, position: idx,
        title: b.title.trim(),
        duration_minutes: b.duration_minutes,
        notes: b.notes.trim() || null,
        drill_id: b.drill_id,
      }));
    if (rows.length > 0) {
      const { error } = await supabase.from("session_training_blocks").insert(rows);
      if (error) { setBusy(false); toast.error(error.message); return; }
    }
    setBusy(false);
    toast.success("Training plan saved");
    load();
  };

  const applyTemplate = (tplId: string) => {
    const tpl = templates.find((t) => t.id === tplId);
    if (!tpl) return;
    setBlocks(
      (tpl.blocks as any[]).map((b, idx) => ({
        position: idx,
        title: b.title ?? "",
        duration_minutes: b.duration_minutes ?? null,
        notes: b.notes ?? "",
        drill_id: b.drill_id ?? null,
      })),
    );
    setPickTpl("");
    toast.success(`Loaded "${tpl.name}"`);
  };

  const saveAsTemplate = async () => {
    const name = prompt("Template name?")?.trim();
    if (!name) return;
    const payload = blocks.filter((b) => b.title.trim()).map((b, idx) => ({
      position: idx, title: b.title.trim(),
      duration_minutes: b.duration_minutes, notes: b.notes.trim(), drill_id: b.drill_id,
    }));
    const { error } = await supabase.from("training_plan_templates").insert({
      club_id: clubId, name, blocks: payload,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Template saved");
    load();
  };

  if (loading) return <Card className="p-4 text-sm text-muted-foreground">Loading…</Card>;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-primary" />
        <div className="font-semibold">Edit training plan</div>
      </div>

      {templates.length > 0 && (
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <Select value={pickTpl} onValueChange={applyTemplate}>
            <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Apply a template…" /></SelectTrigger>
            <SelectContent>
              {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Overview</Label>
        <Textarea rows={2} value={overview} onChange={(e) => setOverview(e.target.value)} placeholder="Optional session focus / goals" />
      </div>

      <div className="space-y-3">
        {blocks.map((b, i) => (
          <div key={i} className="rounded-md border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{i + 1}</Badge>
              <div className="ml-auto flex gap-1">
                <Button type="button" size="icon" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0}>
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" onClick={() => move(i, 1)} disabled={i === blocks.length - 1}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" onClick={() => remove(i)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
            <Input
              value={b.title}
              onChange={(e) => update(i, { title: e.target.value })}
              placeholder="Block title (e.g. Warm-up paddle)"
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                min={1}
                value={b.duration_minutes ?? ""}
                onChange={(e) => update(i, { duration_minutes: e.target.value ? Number(e.target.value) : null })}
                placeholder="Minutes"
              />
              <Select value={b.drill_id ?? "none"} onValueChange={(v) => applyDrill(i, v === "none" ? "" : v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Link a drill" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No drill</SelectItem>
                  {drills.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Textarea
              rows={2}
              value={b.notes}
              onChange={(e) => update(i, { notes: e.target.value })}
              placeholder="Coaching notes (optional)"
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={add}>
          <Plus className="h-4 w-4 mr-2" /> Add block
        </Button>
        {canManageTemplates && blocks.length > 0 && (
          <Button type="button" variant="ghost" onClick={saveAsTemplate}>
            <BookmarkPlus className="h-4 w-4 mr-2" /> Save as template
          </Button>
        )}
        <Button type="button" className="ml-auto" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save plan"}
        </Button>
      </div>
    </Card>
  );
}
