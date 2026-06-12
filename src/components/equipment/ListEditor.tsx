import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2, Wrench, Search, Link2 } from "lucide-react";
import { toast } from "sonner";

export const ITEM_CATEGORIES = [
  "Boats & Engines",
  "Safety & Gear",
  "Course Setup",
  "Other",
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

type DraftItem = {
  id?: string;
  name: string;
  category: ItemCategory;
  quantity: number;
  equipment_id?: string | null;
};

type GearRow = {
  id: string;
  name: string;
  category: string | null;
  serial_number: string | null;
};

function normaliseCategory(c: string | null | undefined): ItemCategory {
  if (!c) return "Other";
  if ((ITEM_CATEGORIES as readonly string[]).includes(c)) return c as ItemCategory;
  const lc = c.toLowerCase();
  if (/boat|motor|engine|hull|irb/.test(lc)) return "Boats & Engines";
  if (/safety|ppe|rescue|first|aid|radio/.test(lc)) return "Safety & Gear";
  if (/course|buoy|flag|cone/.test(lc)) return "Course Setup";
  return "Other";
}

export function ListEditor({ clubId, userId, listId }: {
  clubId: string;
  userId: string;
  listId?: string;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([
    { name: "", category: "Boats & Engines", quantity: 1, equipment_id: null },
  ]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!listId);
  const [gearOpen, setGearOpen] = useState(false);

  useEffect(() => {
    if (!listId) return;
    (async () => {
      const { data: list } = await supabase
        .from("equipment_lists")
        .select("name, description, event_name, event_date, location, notes")
        .eq("id", listId)
        .maybeSingle();
      const { data: itemRows } = await supabase
        .from("equipment_list_items")
        .select("id, name, category, quantity, equipment_id")
        .eq("list_id", listId)
        .order("sort_order")
        .order("created_at");
      if (list) {
        setName(list.name);
        setDescription(list.description ?? "");
        setEventName((list as { event_name?: string | null }).event_name ?? "");
        setEventDate((list as { event_date?: string | null }).event_date ?? "");
        setLocation((list as { location?: string | null }).location ?? "");
        setNotes((list as { notes?: string | null }).notes ?? "");
      }
      if (itemRows && itemRows.length) {
        setItems(itemRows.map((r) => ({
          id: r.id,
          name: r.name,
          category: normaliseCategory(r.category),
          quantity: r.quantity,
          equipment_id: (r as { equipment_id?: string | null }).equipment_id ?? null,
        })));
      }
      setLoading(false);
    })();
  }, [listId]);

  const updateItem = (i: number, patch: Partial<DraftItem>) =>
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addCustom = () =>
    setItems((arr) => [...arr, { name: "", category: "Other", quantity: 1, equipment_id: null }]);
  const removeItem = (i: number) =>
    setItems((arr) => (arr.length <= 1 ? arr : arr.filter((_, idx) => idx !== i)));

  const addGearItems = (gear: GearRow[]) => {
    setItems((arr) => {
      // Drop a single empty placeholder row if present
      const cleaned = arr.length === 1 && !arr[0].name && !arr[0].id ? [] : arr;
      const existingGearIds = new Set(cleaned.map((i) => i.equipment_id).filter(Boolean));
      const fresh: DraftItem[] = gear
        .filter((g) => !existingGearIds.has(g.id))
        .map((g) => ({
          name: g.name,
          category: normaliseCategory(g.category),
          quantity: 1,
          equipment_id: g.id,
        }));
      return [...cleaned, ...fresh];
    });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("List name is required"); return; }
    const cleanItems = items
      .map((it) => ({ ...it, name: it.name.trim() }))
      .filter((it) => it.name);
    if (cleanItems.length === 0) {
      toast.error("Add at least one item");
      return;
    }
    setBusy(true);

    try {
      const listPayload = {
        name: name.trim(),
        description: description.trim() || null,
        event_name: eventName.trim() || null,
        event_date: eventDate || null,
        location: location.trim() || null,
        notes: notes.trim() || null,
      };

      let savedId = listId;
      if (savedId) {
        const { error } = await supabase
          .from("equipment_lists")
          .update(listPayload as never)
          .eq("id", savedId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("equipment_lists")
          .insert({ club_id: clubId, created_by: userId, ...listPayload } as never)
          .select("id")
          .single();
        if (error || !data) throw error ?? new Error("Failed to create list");
        savedId = data.id;
      }

      const keptIds = cleanItems.map((i) => i.id).filter(Boolean) as string[];
      if (listId) {
        const { data: current } = await supabase
          .from("equipment_list_items")
          .select("id")
          .eq("list_id", savedId);
        const toDelete = (current ?? [])
          .map((r) => r.id)
          .filter((id) => !keptIds.includes(id));
        if (toDelete.length) {
          const { error } = await supabase.from("equipment_list_items").delete().in("id", toDelete);
          if (error) throw error;
        }
      }

      const updates = cleanItems.map((it, idx) => ({ it, idx })).filter(({ it }) => !!it.id);
      const inserts = cleanItems
        .map((it, idx) => ({ it, idx }))
        .filter(({ it }) => !it.id)
        .map(({ it, idx }) => ({
          list_id: savedId!,
          name: it.name,
          category: it.category,
          quantity: Math.max(1, Math.floor(it.quantity || 1)),
          sort_order: idx,
          equipment_id: it.equipment_id ?? null,
        }));

      for (const { it, idx } of updates) {
        const { error } = await supabase
          .from("equipment_list_items")
          .update({
            name: it.name,
            category: it.category,
            quantity: Math.max(1, Math.floor(it.quantity || 1)),
            sort_order: idx,
            equipment_id: it.equipment_id ?? null,
          } as never)
          .eq("id", it.id!);
        if (error) throw error;
      }

      if (inserts.length) {
        const { error } = await supabase.from("equipment_list_items").insert(inserts as never);
        if (error) throw error;
      }

      toast.success(listId ? "List updated" : "List created");
      navigate({ to: "/equipment/lists", replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Couldn't save list";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>;

  const linkedGearIds = new Set(items.map((i) => i.equipment_id).filter(Boolean) as string[]);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="name">List name</Label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Aussies 2027 kit" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="event">Event <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input id="event" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Ocean Roar Round 4" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="event-date">Date <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input id="event-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="loc">Location <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Main Beach" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="desc">Description</Label>
          <Textarea id="desc" rows={2} value={description}
            onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reminders, packing tips…" />
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Items</h2>
        <div className="flex gap-2">
          <GearPickerDialog
            open={gearOpen}
            setOpen={setGearOpen}
            clubId={clubId}
            alreadyLinked={linkedGearIds}
            onAdd={addGearItems}
          />
          <Button type="button" size="sm" variant="outline" onClick={addCustom} className="gap-1">
            <Plus className="h-4 w-4" /> Custom
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {items.map((it, i) => (
          <Card key={it.id ?? `new-${i}`} className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Input
                value={it.name}
                onChange={(e) => updateItem(i, { name: e.target.value })}
                placeholder="Item name"
                className="flex-1"
                disabled={!!it.equipment_id}
              />
              <Button
                type="button" size="icon" variant="ghost"
                onClick={() => removeItem(i)}
                disabled={items.length <= 1}
                aria-label="Remove item"
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
            <div className="grid grid-cols-[1fr_84px] gap-2">
              <Select
                value={it.category}
                onValueChange={(v) => updateItem(i, { category: v as ItemCategory })}
                disabled={!!it.equipment_id}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ITEM_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={1}
                value={it.quantity}
                onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                aria-label="Quantity"
              />
            </div>
            {it.equipment_id && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Link2 className="h-3 w-3" /> Linked to gear
              </div>
            )}
          </Card>
        ))}
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1"
          onClick={() => navigate({ to: "/equipment/lists" })}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy} className="flex-1">
          {busy ? "Saving…" : listId ? "Save changes" : "Create list"}
        </Button>
      </div>
    </form>
  );
}

function GearPickerDialog({
  open, setOpen, clubId, alreadyLinked, onAdd,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  clubId: string;
  alreadyLinked: Set<string>;
  onAdd: (gear: GearRow[]) => void;
}) {
  const [gear, setGear] = useState<GearRow[]>([]);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setPicked(new Set());
    (async () => {
      const { data } = await supabase
        .from("equipment")
        .select("id, name, category, serial_number")
        .eq("club_id", clubId)
        .eq("status", "active")
        .order("name");
      setGear((data ?? []) as GearRow[]);
      setLoading(false);
    })();
  }, [open, clubId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return gear;
    return gear.filter((g) =>
      g.name.toLowerCase().includes(q)
      || (g.category ?? "").toLowerCase().includes(q)
      || (g.serial_number ?? "").toLowerCase().includes(q)
    );
  }, [gear, search]);

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirm = () => {
    const chosen = gear.filter((g) => picked.has(g.id));
    if (!chosen.length) { setOpen(false); return; }
    onAdd(chosen);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" className="gap-1">
          <Wrench className="h-4 w-4" /> From gear
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add from gear</DialogTitle></DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, category, serial…"
            className="pl-8"
          />
        </div>
        <div className="max-h-[55vh] overflow-y-auto -mx-2 px-2 space-y-1">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading gear…</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {gear.length === 0 ? "No equipment in this club yet." : "No matches."}
            </div>
          ) : filtered.map((g) => {
            const linked = alreadyLinked.has(g.id);
            const checked = picked.has(g.id);
            return (
              <button
                type="button"
                key={g.id}
                onClick={() => !linked && toggle(g.id)}
                disabled={linked}
                className={`w-full flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors ${
                  linked ? "opacity-50 cursor-not-allowed" :
                  checked ? "bg-primary/10 border-primary" : "hover:bg-accent/5"
                }`}
              >
                <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                  <Wrench className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{g.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {[g.category, g.serial_number].filter(Boolean).join(" · ") || "No details"}
                  </div>
                </div>
                {linked && <Badge variant="outline" className="text-[10px]">Added</Badge>}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" className="flex-1" onClick={confirm} disabled={picked.size === 0}>
            Add {picked.size > 0 ? `(${picked.size})` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
