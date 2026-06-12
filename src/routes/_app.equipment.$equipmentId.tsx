import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCanManage, useIsAdmin } from "@/lib/club-context";
import { useConfirm } from "@/lib/confirm";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { ChevronLeft, AlertTriangle, Trash2, Plus, Wrench, Save } from "lucide-react";
import { toast } from "sonner";
import { CategoryPicker } from "@/components/equipment/CategoryPicker";
import { memberFullName } from "@/lib/names";

export const Route = createFileRoute("/_app/equipment/$equipmentId")({
  head: () => ({ meta: [{ title: "Equipment — IRB Coaching" }] }),
  component: EquipmentDetail,
});

type Equipment = {
  id: string; club_id: string; name: string; category: string | null;
  serial_number: string | null; notes: string | null; status: "active" | "retired";
  location: string | null;
};

type Fault = {
  id: string; description: string; status: "open" | "repaired" | "cleared";
  reported_by: string; reported_at: string; resolved_at: string | null;
  resolution_notes: string | null;
  reporter_name: string | null;
};

function faultStatusLabel(status: Fault["status"]): string {
  if (status === "open") return "Open";
  if (status === "cleared") return "Cleared";
  return "Repaired";
}

function faultStatusVariant(status: Fault["status"]): "destructive" | "success" | "accent" {
  if (status === "open") return "destructive";
  if (status === "repaired") return "success";
  return "accent";
}

function EquipmentDetail() {
  const { equipmentId } = Route.useParams();
  const { user } = useAuth();
  const canManage = useCanManage();
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const confirm = useConfirm();


  const [item, setItem] = useState<Equipment | null>(null);
  const [faults, setFaults] = useState<Fault[]>([]);
  const [reportOpen, setReportOpen] = useState(false);

  // Staged edits (only for users who can manage)
  type Draft = Pick<Equipment, "name" | "category" | "serial_number" | "location" | "notes" | "status">;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data: e } = await supabase.from("equipment").select("*")
      .eq("id", equipmentId).maybeSingle();
    setItem(e as Equipment | null);
    if (e) {
      const row = e as Equipment;
      setDraft({
        name: row.name,
        category: row.category,
        serial_number: row.serial_number,
        location: row.location,
        notes: row.notes,
        status: row.status,
      });
    }
    const { data: f } = await supabase.from("equipment_faults")
      .select("*")
      .eq("equipment_id", equipmentId)
      .order("reported_at", { ascending: false });
    const rows = (f ?? []) as Omit<Fault, "reporter_name">[];
    const ids = Array.from(new Set(rows.map((x) => x.reported_by)));
    const nameMap: Record<string, string> = {};
    if (ids.length && e) {
      const { data: memData } = await supabase
        .from("members")
        .select("auth_user_id, first_name, last_name, preferred_name")
        .in("auth_user_id", ids)
        .eq("club_id", (e as Equipment).club_id);
      (memData ?? []).forEach((m) => { nameMap[m.auth_user_id] = memberFullName(m, "Unknown"); });
    }
    setFaults(rows.map((r) => ({ ...r, reporter_name: nameMap[r.reported_by] ?? null })));
  }, [equipmentId]);

  useEffect(() => { load(); }, [load]);

  const dirty = useMemo(() => {
    if (!item || !draft || !canManage) return false;
    return (
      (draft.name ?? "") !== (item.name ?? "") ||
      (draft.category ?? "") !== (item.category ?? "") ||
      (draft.serial_number ?? "") !== (item.serial_number ?? "") ||
      (draft.location ?? "") !== (item.location ?? "") ||
      (draft.notes ?? "") !== (item.notes ?? "") ||
      draft.status !== item.status
    );
  }, [item, draft, canManage]);

  useUnsavedChanges(dirty);

  if (!item || !draft) {
    return <AppShell><div className="py-12 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;
  }

  const setField = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  };

  const save = async () => {
    if (!draft) return;
    const name = (draft.name ?? "").trim();
    if (!name) { toast.error("Name is required"); return; }
    setSaving(true);
    const patch: Partial<Equipment> = {
      name,
      category: draft.category?.trim() || null,
      serial_number: draft.serial_number?.trim() || null,
      location: draft.location?.trim() || null,
      notes: draft.notes?.trim() || null,
      status: draft.status,
    };
    const { error } = await supabase.from("equipment").update(patch as never).eq("id", item.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    load();
  };

  const cancelEdits = async () => {
    if (dirty) {
      const ok = await confirm({
        title: "Discard changes?",
        description: "Any unsaved edits to this equipment will be lost.",
        confirmText: "Discard",
      });
      if (!ok) return;
    }
    setDraft({
      name: item.name, category: item.category, serial_number: item.serial_number,
      location: item.location, notes: item.notes, status: item.status,
    });
  };

  const remove = async () => {
    const ok = await confirm({
      title: "Delete this equipment?",
      description: `"${item.name}" and its fault history will be removed. This can't be undone.`,
    });
    if (!ok) return;
    const { error } = await supabase.from("equipment").delete().eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Equipment deleted");
    navigate({ to: "/equipment" });
  };

  const updateFault = async (id: string, status: Fault["status"], notes?: string) => {
    if (!canManage) return;
    const prev = faults;
    const resolvedAt = (status === "cleared" || status === "repaired") ? new Date().toISOString() : null;
    setFaults((cur) => cur.map((f) => f.id === id
      ? { ...f, status, resolved_at: resolvedAt, resolution_notes: notes ?? f.resolution_notes }
      : f));
    const patch: { status: Fault["status"]; resolved_by?: string | null; resolved_at?: string | null; resolution_notes?: string | null } = { status };
    if (status === "cleared" || status === "repaired") {
      patch.resolved_by = user?.id ?? null;
      patch.resolved_at = resolvedAt;
    } else {
      patch.resolved_by = null;
      patch.resolved_at = null;
    }
    if (notes !== undefined) patch.resolution_notes = notes;
    const { data, error } = await supabase.from("equipment_faults").update(patch).eq("id", id).select("id").maybeSingle();
    if (error || !data) { setFaults(prev); toast.error(error?.message ?? "You don't have permission to update this fault."); return; }
    toast.success(status === "open" ? "Fault reopened" : "Marked as fixed");
  };

  return (
    <AppShell>
      <Link to="/equipment" className="inline-flex items-center text-sm text-muted-foreground mb-2">
        <ChevronLeft className="h-4 w-4" /> Equipment
      </Link>

      <Card className="p-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Wrench className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{item.name}</h1>
            <div className="text-xs text-muted-foreground">
              {[item.category, item.serial_number, item.location].filter(Boolean).join(" · ") || "No details"}
            </div>
          </div>
          {item.status === "retired" && <Badge variant="outline">Retired</Badge>}
        </div>

        {canManage ? (
          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                value={draft.name ?? ""}
                onChange={(e) => setField("name", e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <CategoryPicker
                  value={draft.category ?? ""}
                  onChange={(v) => setField("category", v || null)}
                  clubId={item.club_id}
                  canManage={canManage}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Serial #</Label>
                <Input
                  value={draft.serial_number ?? ""}
                  onChange={(e) => setField("serial_number", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Location</Label>
              <Input
                value={draft.location ?? ""}
                onChange={(e) => setField("location", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea
                rows={3}
                value={draft.notes ?? ""}
                onChange={(e) => setField("notes", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={draft.status} onValueChange={(v) => setField("status", v as Equipment["status"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="retired">Retired</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div
              className={`sticky bottom-2 -mx-1 mt-4 flex gap-2 rounded-lg border bg-background/95 backdrop-blur p-2 shadow-sm transition-opacity ${
                dirty ? "opacity-100" : "opacity-60"
              }`}
              role="region"
              aria-label="Save changes"
            >
              <div className="flex-1 self-center px-1 text-xs text-muted-foreground">
                {dirty ? "Unsaved changes" : "All changes saved"}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={cancelEdits} disabled={!dirty || saving}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={save} disabled={!dirty || saving} className="gap-1">
                <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        ) : item.notes ? (
          <p className="mt-3 text-sm whitespace-pre-wrap text-muted-foreground">{item.notes}</p>
        ) : null}
      </Card>

      <div className="mt-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Fault log</h2>
        <ReportFaultDialog
          open={reportOpen} setOpen={setReportOpen}
          equipmentId={item.id} clubId={item.club_id} userId={user?.id ?? null}
          onCreated={(row) => setFaults((cur) => [row, ...cur])}
        />
      </div>

      <div className="mt-3 space-y-2">
        {faults.length === 0 ? (
          <Card className="p-4 text-center text-sm text-muted-foreground">
            No faults reported.
          </Card>
        ) : faults.map((f) => {
          return (
            <Card key={f.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={faultStatusVariant(f.status)}>{faultStatusLabel(f.status)}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(f.reported_at), "d MMM yyyy")}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{f.description}</p>
                  {f.reporter_name && (
                    <div className="mt-1 text-xs text-muted-foreground">Reported by {f.reporter_name}</div>
                  )}
                  {f.resolution_notes && (
                    <div className="mt-2 text-xs bg-muted/40 rounded p-2 whitespace-pre-wrap">
                      {f.resolution_notes}
                    </div>
                  )}
                </div>
                {f.status === "open" && <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />}
              </div>
              {canManage && (
                <div className="mt-3 flex justify-end gap-2">
                  {f.status === "open" ? (
                    <Button size="sm" onClick={() => updateFault(f.id, "repaired")}>
                      Mark fixed
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => updateFault(f.id, "open")}>
                      Reopen
                    </Button>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {isAdmin && (
        <div className="mt-6">
          <Button variant="outline" className="w-full text-destructive border-destructive/30 hover:bg-destructive/10" onClick={remove}>
            <Trash2 className="h-4 w-4 mr-2" /> Delete equipment
          </Button>
        </div>
      )}
    </AppShell>
  );
}


function ReportFaultDialog({ open, setOpen, equipmentId, clubId, userId, onCreated }: {
  open: boolean; setOpen: (v: boolean) => void;
  equipmentId: string; clubId: string; userId: string | null;
  onCreated: (row: Fault) => void;
}) {
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !desc.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.from("equipment_faults").insert({
      equipment_id: equipmentId,
      club_id: clubId,
      reported_by: userId,
      description: desc.trim(),
    }).select("*").single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Fault reported");
    setDesc("");
    setOpen(false);
    if (data) {
      onCreated({ ...(data as Omit<Fault, "reporter_name">), reporter_name: null });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <Plus className="h-4 w-4" /> Report fault
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Report fault</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Textarea
            rows={4}
            placeholder="Describe the fault (e.g. starter cord frayed)…"
            value={desc} onChange={(e) => setDesc(e.target.value)} required
          />
          <DialogFooter>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Saving…" : "Submit fault"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
