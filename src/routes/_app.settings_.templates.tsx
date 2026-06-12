import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useClub, useIsAdmin } from "@/lib/club-context";
import { useCoachPermissions } from "@/lib/coach-permissions";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { ChevronLeft, Plus, Trash2, Pencil, Library } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings_/templates")({
  head: () => ({ meta: [{ title: "Templates — IRB Coaching" }] }),
  component: TemplatesPage,
});

function TemplatesPage() {
  const { activeClub } = useClub();
  const isAdmin = useIsAdmin();
  const { perms, loading } = useCoachPermissions(activeClub?.club_id ?? null);
  if (!activeClub) return <AppShell><div className="py-12 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;
  if (loading) return <AppShell><div className="py-12 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;
  const canEdit = isAdmin || perms.manage_templates;
  if (!canEdit) return <Navigate to="/settings" replace />;

  return (
    <AppShell title="Templates">
      <Link to="/settings" className="inline-flex items-center text-sm text-muted-foreground mb-3">
        <ChevronLeft className="h-4 w-4" /> Settings
      </Link>
      <div className="flex items-center gap-2 mb-3">
        <Library className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Templates</h1>
      </div>
      <Tabs defaultValue="drills" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="drills">Drills</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="surveys">Surveys</TabsTrigger>
          <TabsTrigger value="carpool">Carpool</TabsTrigger>
        </TabsList>
        <TabsContent value="drills"><DrillsTab clubId={activeClub.club_id} /></TabsContent>
        <TabsContent value="plans"><PlansTab clubId={activeClub.club_id} /></TabsContent>
        <TabsContent value="surveys"><SurveysTab clubId={activeClub.club_id} /></TabsContent>
        <TabsContent value="carpool"><CarpoolTab clubId={activeClub.club_id} /></TabsContent>
      </Tabs>
    </AppShell>
  );
}

/* ---------- Drills ---------- */
type Drill = { id: string; name: string; description: string | null; default_duration_minutes: number | null };

function DrillsTab({ clubId }: { clubId: string }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Drill[]>([]);
  const [editing, setEditing] = useState<Drill | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("training_drills")
      .select("id, name, description, default_duration_minutes").eq("club_id", clubId).order("name");
    setItems((data ?? []) as Drill[]);
  }, [clubId]);
  useEffect(() => { load(); }, [load]);

  const startNew = () => { setEditing({ id: "", name: "", description: "", default_duration_minutes: null }); setOpen(true); };
  const startEdit = (d: Drill) => { setEditing({ ...d }); setOpen(true); };

  const save = async () => {
    if (!editing) return;
    const payload = {
      club_id: clubId, name: editing.name.trim(),
      description: editing.description?.trim() || null,
      default_duration_minutes: editing.default_duration_minutes,
    };
    if (!payload.name) { toast.error("Name required"); return; }
    if (editing.id) {
      const { error } = await supabase.from("training_drills").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("training_drills").insert({ ...payload, created_by: user?.id ?? null });
      if (error) { toast.error(error.message); return; }
    }
    setOpen(false); setEditing(null); toast.success("Saved"); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this drill?")) return;
    const { error } = await supabase.from("training_drills").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted"); load();
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Reusable drills that coaches can link from training plans.</p>
        <Button size="sm" onClick={startNew}><Plus className="h-4 w-4 mr-1" /> New drill</Button>
      </div>
      {items.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">No drills yet.</div>
      ) : (
        <div className="divide-y rounded-md border">
          {items.map((d) => (
            <div key={d.id} className="p-3 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{d.name}</div>
                {d.description && <div className="text-xs text-muted-foreground mt-0.5">{d.description}</div>}
                {d.default_duration_minutes && <div className="text-xs text-muted-foreground">~{d.default_duration_minutes} min</div>}
              </div>
              <Button size="icon" variant="ghost" onClick={() => startEdit(d)}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => remove(d.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Edit drill" : "New drill"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label>Description</Label><Textarea rows={3} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <div><Label>Default duration (min)</Label><Input type="number" min={1} value={editing.default_duration_minutes ?? ""} onChange={(e) => setEditing({ ...editing, default_duration_minutes: e.target.value ? Number(e.target.value) : null })} /></div>
            </div>
          )}
          <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------- Plans ---------- */
type PlanTpl = { id: string; name: string; description: string | null; blocks: any[] };

function PlansTab({ clubId }: { clubId: string }) {
  const { user } = useAuth();
  const [items, setItems] = useState<PlanTpl[]>([]);
  const [editing, setEditing] = useState<PlanTpl | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("training_plan_templates")
      .select("id, name, description, blocks").eq("club_id", clubId).order("name");
    setItems((data ?? []) as PlanTpl[]);
  }, [clubId]);
  useEffect(() => { load(); }, [load]);

  const startNew = () => { setEditing({ id: "", name: "", description: "", blocks: [] }); setOpen(true); };
  const startEdit = (t: PlanTpl) => { setEditing({ ...t }); setOpen(true); };

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { toast.error("Name required"); return; }
    const payload = {
      club_id: clubId, name: editing.name.trim(),
      description: editing.description?.trim() || null,
      blocks: editing.blocks ?? [],
    };
    if (editing.id) {
      const { error } = await supabase.from("training_plan_templates").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("training_plan_templates").insert({ ...payload, created_by: user?.id ?? null });
      if (error) { toast.error(error.message); return; }
    }
    setOpen(false); setEditing(null); toast.success("Saved"); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    const { error } = await supabase.from("training_plan_templates").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted"); load();
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Reusable training plans. Blocks can be added from the session "Plan" tab.</p>
        <Button size="sm" onClick={startNew}><Plus className="h-4 w-4 mr-1" /> New</Button>
      </div>
      {items.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">No plan templates yet.</div>
      ) : (
        <div className="divide-y rounded-md border">
          {items.map((t) => (
            <div key={t.id} className="p-3 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{t.name}</div>
                {t.description && <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>}
                <div className="text-xs text-muted-foreground">{(t.blocks ?? []).length} blocks</div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => startEdit(t)}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Edit plan template" : "New plan template"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label>Description</Label><Textarea rows={3} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <p className="text-xs text-muted-foreground">Add blocks from a session's Plan tab and save as template, or edit blocks here later.</p>
            </div>
          )}
          <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------- Surveys ---------- */
type SurveyTpl = { id: string; name: string; questions: any[] };

function SurveysTab({ clubId }: { clubId: string }) {
  const { user } = useAuth();
  const [items, setItems] = useState<SurveyTpl[]>([]);
  const [editing, setEditing] = useState<SurveyTpl | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("survey_templates")
      .select("id, name, questions").eq("club_id", clubId).order("name");
    setItems((data ?? []) as SurveyTpl[]);
  }, [clubId]);
  useEffect(() => { load(); }, [load]);

  const startNew = () => { setEditing({ id: "", name: "", questions: [{ question_text: "", question_type: "yes_no", options: [], required: true, position: 0 }] }); setOpen(true); };
  const startEdit = (t: SurveyTpl) => { setEditing({ ...t, questions: [...(t.questions ?? [])] }); setOpen(true); };

  const updateQ = (i: number, patch: any) => {
    if (!editing) return;
    const next = [...editing.questions]; next[i] = { ...next[i], ...patch };
    setEditing({ ...editing, questions: next });
  };
  const addQ = () => editing && setEditing({ ...editing, questions: [...editing.questions, { question_text: "", question_type: "yes_no", options: [], required: true, position: editing.questions.length }] });
  const removeQ = (i: number) => editing && setEditing({ ...editing, questions: editing.questions.filter((_, idx) => idx !== i) });

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { toast.error("Name required"); return; }
    const questions = editing.questions
      .filter((q: any) => (q.question_text ?? "").trim())
      .map((q: any, idx: number) => ({
        position: idx,
        question_text: (q.question_text ?? "").trim(),
        question_type: q.question_type ?? "yes_no",
        options: q.question_type === "single_choice" ? (q.options ?? []).filter((o: string) => (o ?? "").trim()) : [],
        required: q.required ?? true,
      }));
    const payload = { club_id: clubId, name: editing.name.trim(), questions };
    if (editing.id) {
      const { error } = await supabase.from("survey_templates").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("survey_templates").insert({ ...payload, created_by: user?.id ?? null });
      if (error) { toast.error(error.message); return; }
    }
    setOpen(false); setEditing(null); toast.success("Saved"); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    const { error } = await supabase.from("survey_templates").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted"); load();
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Reusable pre-training surveys to apply when setting up a session.</p>
        <Button size="sm" onClick={startNew}><Plus className="h-4 w-4 mr-1" /> New</Button>
      </div>
      {items.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">No survey templates yet.</div>
      ) : (
        <div className="divide-y rounded-md border">
          {items.map((t) => (
            <div key={t.id} className="p-3 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{t.name}</div>
                <div className="text-xs text-muted-foreground">{(t.questions ?? []).length} questions</div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => startEdit(t)}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit survey template" : "New survey template"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Pre-training basics" /></div>
              <div className="space-y-2">
                <Label>Questions</Label>
                {editing.questions.map((q: any, i: number) => (
                  <div key={i} className="rounded-md border p-2 space-y-2">
                    <div className="flex gap-2">
                      <Input value={q.question_text ?? ""} onChange={(e) => updateQ(i, { question_text: e.target.value })} placeholder={`Q${i + 1} text`} />
                      <Button size="icon" variant="ghost" onClick={() => removeQ(i)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select className="text-xs border rounded h-9 px-2 bg-background" value={q.question_type ?? "yes_no"} onChange={(e) => updateQ(i, { question_type: e.target.value })}>
                        <option value="yes_no">Yes / No</option>
                        <option value="text">Short answer</option>
                        <option value="single_choice">Choose one</option>
                      </select>
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={!!q.required} onChange={(e) => updateQ(i, { required: e.target.checked })} />
                        Required
                      </label>
                    </div>
                    {q.question_type === "single_choice" && (
                      <Input
                        value={(q.options ?? []).join(", ")}
                        onChange={(e) => updateQ(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                        placeholder="Comma-separated options"
                      />
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addQ}><Plus className="h-4 w-4 mr-1" /> Add question</Button>
              </div>
            </div>
          )}
          <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------- Carpool ---------- */
type CarpoolTpl = { id: string; name: string; vehicles: any[] };

function CarpoolTab({ clubId }: { clubId: string }) {
  const { user } = useAuth();
  const [items, setItems] = useState<CarpoolTpl[]>([]);
  const [editing, setEditing] = useState<CarpoolTpl | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("carpool_templates")
      .select("id, name, vehicles").eq("club_id", clubId).order("name");
    setItems((data ?? []) as CarpoolTpl[]);
  }, [clubId]);
  useEffect(() => { load(); }, [load]);

  const startNew = () => { setEditing({ id: "", name: "", vehicles: [{ vehicle_name: "", available_seats: 4, can_tow_trailer: false }] }); setOpen(true); };
  const startEdit = (t: CarpoolTpl) => { setEditing({ ...t, vehicles: [...t.vehicles] }); setOpen(true); };

  const updateVehicle = (i: number, patch: any) => {
    if (!editing) return;
    const next = [...editing.vehicles]; next[i] = { ...next[i], ...patch };
    setEditing({ ...editing, vehicles: next });
  };
  const addVehicle = () => editing && setEditing({ ...editing, vehicles: [...editing.vehicles, { vehicle_name: "", available_seats: 4, can_tow_trailer: false }] });
  const removeVehicle = (i: number) => editing && setEditing({ ...editing, vehicles: editing.vehicles.filter((_, idx) => idx !== i) });

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { toast.error("Name required"); return; }
    const payload = { club_id: clubId, name: editing.name.trim(), vehicles: editing.vehicles };
    if (editing.id) {
      const { error } = await supabase.from("carpool_templates").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("carpool_templates").insert({ ...payload, created_by: user?.id ?? null });
      if (error) { toast.error(error.message); return; }
    }
    setOpen(false); setEditing(null); toast.success("Saved"); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    const { error } = await supabase.from("carpool_templates").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted"); load();
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Save typical vehicle setups for fast carpool creation.</p>
        <Button size="sm" onClick={startNew}><Plus className="h-4 w-4 mr-1" /> New</Button>
      </div>
      {items.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">No carpool templates yet.</div>
      ) : (
        <div className="divide-y rounded-md border">
          {items.map((t) => (
            <div key={t.id} className="p-3 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.vehicles.length} vehicles</div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => startEdit(t)}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit carpool template" : "New carpool template"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>Vehicles</Label>
                {editing.vehicles.map((v, i) => (
                  <div key={i} className="rounded-md border p-2 space-y-2">
                    <div className="flex gap-2">
                      <Input value={v.vehicle_name ?? ""} onChange={(e) => updateVehicle(i, { vehicle_name: e.target.value })} placeholder="Vehicle name" />
                      <Button size="icon" variant="ghost" onClick={() => removeVehicle(i)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="number" min={1} value={v.available_seats ?? 4} onChange={(e) => updateVehicle(i, { available_seats: Number(e.target.value) })} placeholder="Seats" />
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={!!v.can_tow_trailer} onChange={(e) => updateVehicle(i, { can_tow_trailer: e.target.checked })} />
                        Can tow trailer
                      </label>
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addVehicle}><Plus className="h-4 w-4 mr-1" /> Add vehicle</Button>
              </div>
            </div>
          )}
          <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
