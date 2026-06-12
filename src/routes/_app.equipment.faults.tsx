import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useClub, useCanManage } from "@/lib/club-context";
import { AppShell } from "@/components/AppShell";
import { EquipmentTabs } from "@/components/equipment/EquipmentTabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";
import { EmptyState } from "@/components/ui/empty-state";

export const Route = createFileRoute("/_app/equipment/faults")({
  head: () => ({ meta: [{ title: "Faults — IRB Coaching" }] }),
  component: FaultsPage,
});

type Fault = {
  id: string;
  title: string | null;
  description: string;
  equipment_name: string | null;
  equipment_id: string | null;
  reported_by: string;
  reported_at: string;
  status: "open" | "repaired" | "cleared";
  resolved_by: string | null;
  resolved_at: string | null;
};

type EquipmentLite = { id: string; name: string };
type ProfileLite = { id: string; full_name: string | null; first_name: string | null; last_name: string | null };

function displayName(p?: ProfileLite | null): string {
  if (!p) return "Unknown";
  const fn = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return fn || p.full_name || "Unknown";
}

function statusLabel(status: Fault["status"]): string {
  if (status === "open") return "Open";
  if (status === "cleared") return "Cleared";
  return "Repaired";
}

function statusBadgeVariant(status: Fault["status"]): "destructive" | "success" | "accent" {
  if (status === "open") return "destructive";
  if (status === "repaired") return "success";
  return "accent";
}

function FaultsPage() {
  const { activeClub } = useClub();
  const { user } = useAuth();
  const canManage = useCanManage();
  const [faults, setFaults] = useState<Fault[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [equipment, setEquipment] = useState<EquipmentLite[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!activeClub) return;
    const [{ data: fdata }, { data: edata }] = await Promise.all([
      supabase
        .from("equipment_faults")
        .select("id, title, description, equipment_name, equipment_id, reported_by, reported_at, status, resolved_by, resolved_at")
        .eq("club_id", activeClub.club_id)
        .order("reported_at", { ascending: false }),
      supabase
        .from("equipment")
        .select("id, name")
        .eq("club_id", activeClub.club_id)
        .order("name"),
    ]);
    const list = (fdata ?? []) as Fault[];
    setFaults(list);
    setEquipment((edata ?? []) as EquipmentLite[]);

    const userIds = Array.from(new Set(list.flatMap((f) => [f.reported_by, f.resolved_by]).filter(Boolean) as string[]));
    if (userIds.length) {
      const { data: p } = await supabase
        .from("profiles")
        .select("id, full_name, first_name, last_name")
        .in("id", userIds);
      const map: Record<string, ProfileLite> = {};
      (p ?? []).forEach((row) => { map[row.id] = row as ProfileLite; });
      setProfiles(map);
    }
  }, [activeClub?.club_id]);

  useEffect(() => { load(); }, [load]);
  useRefetchOnFocus(load);

  const updateFaultStatus = async (id: string, nextStatus: Fault["status"]) => {
    if (!user || !canManage) return;
    const prev = faults;
    const resolvedAt = nextStatus === "open" ? null : new Date().toISOString();
    const patch = nextStatus === "open"
      ? { status: nextStatus, resolved_by: null, resolved_at: null }
      : { status: nextStatus, resolved_by: user.id, resolved_at: resolvedAt };

    setFaults((cur) => cur.map((f) => f.id === id
      ? { ...f, ...patch }
      : f));

    const { data, error } = await supabase
      .from("equipment_faults")
      .update(patch)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      setFaults(prev);
      toast.error(error?.message ?? "You don't have permission to update this fault.");
      return;
    }
    toast.success(nextStatus === "open" ? "Fault reopened" : "Marked as fixed");
  };

  const onFaultCreated = async (row: Fault) => {
    setFaults((cur) => [row, ...cur]);
    if (row.reported_by && !profiles[row.reported_by]) {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, first_name, last_name")
        .eq("id", row.reported_by)
        .maybeSingle();
      if (data) setProfiles((cur) => ({ ...cur, [data.id]: data as ProfileLite }));
    }
  };

  if (!activeClub) {
    return <AppShell><div className="py-12 text-center text-sm text-muted-foreground">Select a club first.</div></AppShell>;
  }

  const equipNames: Record<string, string> = {};
  equipment.forEach((e) => { equipNames[e.id] = e.name; });

  return (
    <AppShell title="Equipment" action={
      user ? (
        <Button size="sm" variant="secondary" className="h-10 gap-1" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Report
        </Button>
      ) : undefined
    }>
      <EquipmentTabs />

      {faults.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="h-5 w-5" />}
          title="No faults reported"
          description="Spot a broken radio, damaged hull, or missing kit? Log a fault so coaches can fix it before the next session."
          action={
            <Button onClick={() => setOpen(true)} className="h-11">
              <Plus className="h-4 w-4 mr-1" /> Report your first fault
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {faults.map((f) => {
            const equipName = f.equipment_name
              || (f.equipment_id ? equipNames[f.equipment_id] : null)
              || "—";
            const isOpen = f.status === "open";
            return (
              <Card key={f.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold truncate">
                        {f.title || f.description.slice(0, 60)}
                      </div>
                      <Badge variant={statusBadgeVariant(f.status)} className="text-[10px]">
                        {statusLabel(f.status)}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {equipName} · {displayName(profiles[f.reported_by])} ·{" "}
                      {new Date(f.reported_at).toLocaleDateString()}
                    </div>
                    {f.title && (
                      <p className="mt-2 text-sm whitespace-pre-wrap">{f.description}</p>
                    )}
                  </div>
                </div>
                {canManage && (
                  <div className="mt-3 flex justify-end">
                    {isOpen ? (
                      <Button size="sm" variant="outline" className="h-10 gap-1" onClick={() => updateFaultStatus(f.id, "repaired")}>
                        <CheckCircle2 className="h-4 w-4" /> Mark fixed
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="h-10" onClick={() => updateFaultStatus(f.id, "open")}>
                        Reopen
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {user && (
        <NewFaultDialog
          open={open} setOpen={setOpen}
          clubId={activeClub.club_id} userId={user.id}
          equipment={equipment}
          onCreated={onFaultCreated}
        />
      )}
    </AppShell>
  );
}

function NewFaultDialog({ open, setOpen, clubId, userId, equipment, onCreated }: {
  open: boolean; setOpen: (v: boolean) => void;
  clubId: string; userId: string;
  equipment: EquipmentLite[];
  onCreated: (row: Fault) => void;
}) {
  const [title, setTitle] = useState("");
  const [equipmentId, setEquipmentId] = useState<string>("");
  const [equipName, setEquipName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(""); setEquipmentId(""); setEquipName(""); setDesc("");
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !desc.trim()) {
      toast.error("Title and description are required");
      return;
    }
    setBusy(true);
    const isOther = equipmentId === "" || equipmentId === "__other__";
    const { data, error } = await supabase.from("equipment_faults").insert({
      club_id: clubId,
      reported_by: userId,
      title: title.trim(),
      equipment_id: isOther ? null : equipmentId,
      equipment_name: isOther ? (equipName.trim() || null) : null,
      description: desc.trim(),
      status: "open",
    }).select("id, title, description, equipment_name, equipment_id, reported_by, reported_at, status, resolved_by, resolved_at").single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Fault reported");
    setOpen(false);
    if (data) onCreated(data as Fault);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Report a fault</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Fault title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Engine won't start" required className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label>Equipment</Label>
            {equipment.length > 0 ? (
              <Select value={equipmentId} onValueChange={setEquipmentId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select gear item" />
                </SelectTrigger>
                <SelectContent>
                  {equipment.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                  <SelectItem value="__other__">Other / not listed…</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-muted-foreground">No gear items yet — describe it below.</p>
            )}
            {(equipment.length === 0 || equipmentId === "__other__") && (
              <Input value={equipName} onChange={(e) => setEquipName(e.target.value)}
                placeholder="IRB Hull #3" className="h-11 mt-2" />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={4} value={desc} onChange={(e) => setDesc(e.target.value)}
              placeholder="What happened and what's affected?" required />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy} className="w-full h-11">
              {busy ? "Submitting…" : "Submit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
