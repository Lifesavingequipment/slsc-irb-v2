import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClub, useCanManage } from "@/lib/club-context";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Wrench, AlertTriangle, ChevronRight, Search, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { EquipmentTabs } from "@/components/equipment/EquipmentTabs";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";
import { EmptyState } from "@/components/ui/empty-state";
import { CategoryPicker } from "@/components/equipment/CategoryPicker";
import { CategoriesManager } from "@/components/equipment/CategoriesManager";

export const Route = createFileRoute("/_app/equipment/")({
  head: () => ({ meta: [{ title: "Equipment — IRB Coaching" }] }),
  component: EquipmentList,
});

type Equipment = {
  id: string; name: string; category: string | null; serial_number: string | null;
  notes: string | null; status: "active" | "retired"; location: string | null;
};

type StatusFilter = "all" | "active" | "retired";
type FaultFilter = "all" | "fault" | "ok";

function EquipmentList() {
  const { activeClub } = useClub();
  const canManage = useCanManage();
  const [items, setItems] = useState<Equipment[]>([]);
  const [faultCounts, setFaultCounts] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [faultFilter, setFaultFilter] = useState<FaultFilter>("all");

  const load = useCallback(async () => {
    if (!activeClub) return;
    const { data } = await supabase
      .from("equipment").select("*")
      .eq("club_id", activeClub.club_id)
      .order("name");
    const list = (data ?? []) as Equipment[];
    setItems(list);
    if (list.length) {
      const { data: f } = await supabase
        .from("equipment_faults")
        .select("equipment_id")
        .in("equipment_id", list.map((i) => i.id))
        .eq("status", "open");
      const counts: Record<string, number> = {};
      (f ?? []).forEach((x) => { if (x.equipment_id) counts[x.equipment_id] = (counts[x.equipment_id] ?? 0) + 1; });
      setFaultCounts(counts);
    } else {
      setFaultCounts({});
    }
  }, [activeClub?.club_id]);

  useEffect(() => { load(); }, [load]);
  useRefetchOnFocus(load);

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => { if (i.category) set.add(i.category); });
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
      if (faultFilter === "fault" && !faultCounts[e.id]) return false;
      if (faultFilter === "ok" && faultCounts[e.id]) return false;
      if (q) {
        const hay = [e.name, e.category, e.serial_number, e.location].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, faultCounts, search, statusFilter, categoryFilter, faultFilter]);

  const hasFilters = !!search || categoryFilter !== "all" || statusFilter !== "all" || faultFilter !== "all";
  const clearFilters = () => { setSearch(""); setCategoryFilter("all"); setStatusFilter("all"); setFaultFilter("all"); };

  if (!activeClub) {
    return <AppShell><div className="py-12 text-center text-sm text-muted-foreground">Select a club first.</div></AppShell>;
  }

  return (
    <AppShell title="Equipment" action={
      canManage ? (
        <NewEquipmentDialog
          open={open} setOpen={setOpen} clubId={activeClub.club_id} canManage={canManage}
          onCreated={(row) => setItems((cur) => [row, ...cur.filter((i) => i.id !== row.id)].sort((a, b) => a.name.localeCompare(b.name)))}
        />
      ) : undefined
    }>
      <EquipmentTabs />

      {items.length > 0 && (
        <div className="space-y-2 mb-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search gear…" className="pl-8"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="retired">Retired</SelectItem>
              </SelectContent>
            </Select>
            <Select value={faultFilter} onValueChange={(v) => setFaultFilter(v as FaultFilter)}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All faults</SelectItem>
                <SelectItem value="fault">With faults</SelectItem>
                <SelectItem value="ok">No faults</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            {canManage ? (
              <CategoriesManager
                clubId={activeClub.club_id}
                trigger={
                  <Button size="sm" variant="ghost" className="text-xs gap-1 h-7 px-2">
                    <Tag className="h-3.5 w-3.5" /> Manage categories
                  </Button>
                }
              />
            ) : <span />}
            {hasFilters && (
              <Button size="sm" variant="ghost" className="text-xs gap-1 h-7 px-2" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<Wrench className="h-5 w-5" />}
          title="No equipment tracked yet"
          description="Add the gear your club owns — IRBs, motors, radios, kits — so members can report faults and pack lists from it."
          action={canManage ? (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add your first item
            </Button>
          ) : undefined}
        />
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No equipment matches your filters.
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <Link key={e.id} to="/equipment/$equipmentId" params={{ equipmentId: e.id }}>
              <Card className="p-4 flex items-center gap-3 hover:bg-accent/5 transition-colors">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Wrench className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold truncate">{e.name}</div>
                    {e.status === "retired" && <Badge variant="outline" className="text-[10px]">Retired</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[e.category, e.serial_number, e.location].filter(Boolean).join(" · ") || "No details"}
                  </div>
                </div>
                {faultCounts[e.id] > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" /> {faultCounts[e.id]}
                  </Badge>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function NewEquipmentDialog({ open, setOpen, clubId, canManage, onCreated }: {
  open: boolean; setOpen: (v: boolean) => void; clubId: string; canManage: boolean; onCreated: (row: Equipment) => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [serial, setSerial] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState<"active" | "retired">("active");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; category?: string }>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: { name?: string; category?: string } = {};
    if (!name.trim()) errs.name = "Name is required";
    if (!category.trim()) errs.category = "Category is required";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const { data, error } = await supabase.from("equipment").insert({
      club_id: clubId,
      name: name.trim(),
      category: category.trim(),
      serial_number: serial.trim() || null,
      status,
      notes: notes.trim() || null,
      location: location.trim() || null,
    } as never).select("id, name, category, serial_number, notes, status, location").single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Equipment added");
    setName(""); setCategory(""); setSerial(""); setLocation(""); setStatus("active"); setNotes("");
    setErrors({});
    setOpen(false);
    if (data) onCreated(data as Equipment);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" className="gap-1">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New equipment</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="IRB Hull #3" aria-invalid={!!errors.name} />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <CategoryPicker value={category} onChange={setCategory} clubId={clubId} canManage={canManage} />
              {errors.category && <p className="text-xs text-destructive">{errors.category}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Serial # <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input value={serial} onChange={(e) => setSerial(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as "active" | "retired")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="retired">Retired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Shed / Trailer" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Saving…" : "Add equipment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
