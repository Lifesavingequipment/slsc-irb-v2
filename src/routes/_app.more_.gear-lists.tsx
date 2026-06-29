import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useClub, useCanManage } from "@/lib/club-context";
import { useConfirm } from "@/lib/confirm";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Plus, ListChecks, Copy, Wrench, Package } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";

export const Route = createFileRoute("/_app/more_/gear-lists")({
  head: () => ({ meta: [{ title: "Gear Lists — IRB Coaching" }] }),
  component: GearListsPage,
});

type GearList = { id: string; name: string; item_count: number };
type Equipment = {
  id: string;
  name: string;
  category: string | null;
  serial_number: string | null;
};
type ListItem = {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  sort_order: number | null;
  equipment_id: string | null;
  equipment: { id: string; name: string; serial_number: string | null } | null;
};

const CATEGORY_ORDER = ["Boats", "Engines", "Safety", "Buoys & Anchors", "Other"];
function categoryRank(cat: string): number {
  const i = CATEGORY_ORDER.findIndex((c) => c.toLowerCase() === cat.toLowerCase());
  return i === -1 ? CATEGORY_ORDER.length : i;
}

function GearListsPage() {
  const { activeClub } = useClub();
  const canManage = useCanManage();
  const { user } = useAuth();
  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  if (!activeClub || !user) {
    return (
      <AppShell>
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }
  if (!canManage) return <Navigate to="/more" replace />;

  if (selectedListId) {
    return (
      <ListDetail
        clubId={activeClub.club_id}
        listId={selectedListId}
        onBack={() => setSelectedListId(null)}
      />
    );
  }

  return (
    <AppShell title="Gear Lists">
      <Tabs defaultValue="lists">
        <TabsList className="w-full">
          <TabsTrigger value="lists" className="flex-1">
            Lists
          </TabsTrigger>
          <TabsTrigger value="equipment" className="flex-1">
            Equipment
          </TabsTrigger>
        </TabsList>
        <TabsContent value="lists" className="mt-4">
          <ListsTab clubId={activeClub.club_id} userId={user.id} onOpen={setSelectedListId} />
        </TabsContent>
        <TabsContent value="equipment" className="mt-4">
          <EquipmentTab clubId={activeClub.club_id} userId={user.id} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

/* ------------------------------- Lists tab ------------------------------- */

function ListsTab({
  clubId,
  userId,
  onOpen,
}: {
  clubId: string;
  userId: string;
  onOpen: (id: string) => void;
}) {
  const [lists, setLists] = useState<GearList[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("equipment_lists")
      .select("id, name, items:equipment_list_items(id)")
      .eq("club_id", clubId)
      .is("archived_at", null)
      .order("name");
    setLists(
      (data ?? []).map((l) => ({
        id: l.id,
        name: l.name,
        item_count: (l.items as { id: string }[] | null)?.length ?? 0,
      })),
    );
  }, [clubId]);

  useEffect(() => {
    load();
  }, [load]);
  useRefetchOnFocus(load);

  const createList = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("equipment_lists")
      .insert({ club_id: clubId, created_by: userId, name })
      .select("id")
      .single();
    setBusy(false);
    if (error || !data) {
      toast.error(error?.message ?? "Couldn't create list");
      return;
    }
    setNewName("");
    setNewOpen(false);
    toast.success("List created");
    onOpen(data.id);
  };

  const duplicate = async (l: GearList) => {
    const { data: srcItems } = await supabase
      .from("equipment_list_items")
      .select("name, category, quantity, sort_order, equipment_id")
      .eq("list_id", l.id)
      .order("sort_order");
    const { data: newList, error } = await supabase
      .from("equipment_lists")
      .insert({ club_id: clubId, created_by: userId, name: `Copy of ${l.name}` })
      .select("id")
      .single();
    if (error || !newList) {
      toast.error(error?.message ?? "Couldn't duplicate");
      return;
    }
    if (srcItems && srcItems.length) {
      const { error: insErr } = await supabase.from("equipment_list_items").insert(
        srcItems.map((it) => ({
          list_id: newList.id,
          name: it.name,
          category: it.category,
          quantity: it.quantity,
          sort_order: it.sort_order,
          equipment_id: it.equipment_id ?? null,
        })),
      );
      if (insErr) {
        toast.error(insErr.message);
        return;
      }
    }
    toast.success("List duplicated");
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" /> New list
        </Button>
      </div>

      {lists.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-5 w-5" />}
          title="No gear lists yet"
          description="Build reusable gear lists you can attach to sessions so members can check items off before training."
          action={
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Create a list
            </Button>
          }
        />
      ) : (
        lists.map((l) => (
          <Card key={l.id} className="p-4 flex items-center gap-3">
            <button
              type="button"
              className="flex flex-1 items-center gap-3 min-w-0 text-left"
              onClick={() => onOpen(l.id)}
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <ListChecks className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{l.name}</div>
                <div className="text-xs text-muted-foreground">
                  {l.item_count} {l.item_count === 1 ? "item" : "items"}
                </div>
              </div>
            </button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 shrink-0"
              onClick={() => duplicate(l)}
            >
              <Copy className="h-3.5 w-3.5" /> Duplicate
            </Button>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </Card>
        ))
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New gear list</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>List name</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Saturday IRB kit"
              onKeyDown={(e) => {
                if (e.key === "Enter") createList();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createList} disabled={busy || !newName.trim()}>
              {busy ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------ List detail ------------------------------ */

function ListDetail({
  clubId,
  listId,
  onBack,
}: {
  clubId: string;
  listId: string;
  onBack: () => void;
}) {
  const confirm = useConfirm();
  const [listName, setListName] = useState("");
  const [items, setItems] = useState<ListItem[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);

  // Add-item form state.
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [category, setCategory] = useState("");
  const [equipmentId, setEquipmentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: list }, { data: itemRows }, { data: eq }] = await Promise.all([
      supabase.from("equipment_lists").select("name").eq("id", listId).maybeSingle(),
      supabase
        .from("equipment_list_items")
        .select(
          "id, name, category, quantity, sort_order, equipment_id, equipment:equipment(id, name, serial_number)",
        )
        .eq("list_id", listId)
        .order("sort_order", { nullsFirst: true })
        .order("name"),
      supabase
        .from("equipment")
        .select("id, name, category, serial_number")
        .eq("club_id", clubId)
        .order("name"),
    ]);
    setListName(list?.name ?? "");
    setItems((itemRows ?? []) as unknown as ListItem[]);
    setEquipment((eq ?? []) as Equipment[]);
  }, [listId, clubId]);

  useEffect(() => {
    load();
  }, [load]);

  const existingCategories = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) if (it.category) set.add(it.category);
    return Array.from(set).sort();
  }, [items]);

  const addItem = async () => {
    if (!name.trim()) {
      toast.error("Item name is required");
      return;
    }
    const qty = Math.max(1, Number(quantity) || 1);
    setBusy(true);
    const { error } = await supabase.from("equipment_list_items").insert({
      list_id: listId,
      name: name.trim(),
      quantity: qty,
      category: category.trim() || "Other",
      sort_order: items.length,
      equipment_id: equipmentId,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setName("");
    setQuantity("1");
    setCategory("");
    setEquipmentId(null);
    load();
  };

  const deleteItem = async (it: ListItem) => {
    const ok = await confirm({
      title: `Delete "${it.name}"?`,
      description: "This removes it from the list.",
      confirmText: "Delete",
    });
    if (!ok) return;
    const { error } = await supabase.from("equipment_list_items").delete().eq("id", it.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setItems((cur) => cur.filter((x) => x.id !== it.id));
  };

  const grouped = useMemo(() => {
    const byCat = new Map<string, ListItem[]>();
    for (const it of items) {
      const cat = (it.category ?? "Other").trim() || "Other";
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(it);
    }
    return Array.from(byCat.entries()).sort(([a], [b]) => {
      const r = categoryRank(a) - categoryRank(b);
      return r !== 0 ? r : a.localeCompare(b);
    });
  }, [items]);

  return (
    <AppShell title={listName || "List"}>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center text-sm text-muted-foreground mb-3"
      >
        <ChevronLeft className="h-4 w-4" /> Gear lists
      </button>

      <Card className="p-4 space-y-3 mb-4">
        <div className="text-sm font-semibold">Add item</div>
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Engine" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Quantity</Label>
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Engines"
              list="gear-categories"
            />
            <datalist id="gear-categories">
              {[...new Set([...CATEGORY_ORDER, ...existingCategories])].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>
            Link equipment <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <EquipmentCombobox equipment={equipment} value={equipmentId} onChange={setEquipmentId} />
        </div>
        <Button onClick={addItem} disabled={busy} className="w-full">
          <Plus className="h-4 w-4 mr-1" /> {busy ? "Adding…" : "Add item"}
        </Button>
      </Card>

      {items.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No items yet. Add your first above.
        </Card>
      ) : (
        <div className="space-y-3">
          {grouped.map(([cat, catItems]) => (
            <Card key={cat} className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {cat}
              </div>
              <div className="space-y-1">
                {catItems.map((it) => (
                  <LongPressItem key={it.id} onLongPress={() => deleteItem(it)}>
                    <div className="text-sm font-medium">
                      {it.quantity}x {it.name}
                    </div>
                    {it.equipment && (
                      <Badge variant="secondary" className="mt-0.5 text-[10px] font-normal">
                        {it.equipment.name}
                        {it.equipment.serial_number ? ` · ${it.equipment.serial_number}` : ""}
                      </Badge>
                    )}
                  </LongPressItem>
                ))}
              </div>
            </Card>
          ))}
          <p className="text-center text-[11px] text-muted-foreground">
            Long-press an item to delete it.
          </p>
        </div>
      )}
    </AppShell>
  );
}

function LongPressItem({
  children,
  onLongPress,
}: {
  children: React.ReactNode;
  onLongPress: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const start = () => {
    fired.current = false;
    timer.current = setTimeout(() => {
      fired.current = true;
      onLongPress();
    }, 500);
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  return (
    <div
      className="py-1.5 select-none rounded-md active:bg-muted/50 transition-colors"
      onTouchStart={start}
      onTouchEnd={cancel}
      onTouchMove={cancel}
      onMouseDown={start}
      onMouseUp={cancel}
      onMouseLeave={cancel}
      onContextMenu={(e) => {
        e.preventDefault();
        onLongPress();
      }}
    >
      {children}
    </div>
  );
}

function EquipmentCombobox({
  equipment,
  value,
  onChange,
}: {
  equipment: Equipment[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = equipment.find((e) => e.id === value) ?? null;

  if (selected) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="gap-1">
          {selected.name}
          {selected.serial_number ? ` · ${selected.serial_number}` : ""}
        </Badge>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => {
            onChange(null);
            setQuery("");
          }}
        >
          Clear
        </Button>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? equipment.filter((e) =>
        [e.name, e.category, e.serial_number].filter(Boolean).join(" ").toLowerCase().includes(q),
      )
    : equipment;

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={equipment.length ? "Search equipment…" : "No equipment in club yet"}
        disabled={equipment.length === 0}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md divide-y">
          {filtered.map((e) => (
            <button
              key={e.id}
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => {
                onChange(e.id);
                setOpen(false);
              }}
            >
              {e.name}
              <span className="text-xs text-muted-foreground">
                {[e.category, e.serial_number].filter(Boolean).length
                  ? ` · ${[e.category, e.serial_number].filter(Boolean).join(" · ")}`
                  : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Equipment tab ----------------------------- */

function EquipmentTab({ clubId, userId }: { clubId: string; userId: string }) {
  const [items, setItems] = useState<Equipment[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [serial, setSerial] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("equipment")
      .select("id, name, category, serial_number")
      .eq("club_id", clubId)
      .order("name");
    setItems((data ?? []) as Equipment[]);
  }, [clubId]);

  useEffect(() => {
    load();
  }, [load]);
  useRefetchOnFocus(load);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) if (i.category) set.add(i.category);
    return Array.from(set).sort();
  }, [items]);

  const add = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("equipment").insert({
      club_id: clubId,
      name: name.trim(),
      category: category.trim() || null,
      serial_number: serial.trim() || null,
      status: "active",
      created_by: userId,
    } as never);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setName("");
    setCategory("");
    setSerial("");
    setOpen(false);
    toast.success("Equipment added");
    load();
  };

  const grouped = useMemo(() => {
    const byCat = new Map<string, Equipment[]>();
    for (const it of items) {
      const cat = (it.category ?? "Other").trim() || "Other";
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(it);
    }
    return Array.from(byCat.entries()).sort(([a], [b]) => {
      const r = categoryRank(a) - categoryRank(b);
      return r !== 0 ? r : a.localeCompare(b);
    });
  }, [items]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Add equipment
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Wrench className="h-5 w-5" />}
          title="No equipment yet"
          description="Add the IDed gear your club owns — boats, engines, radios — so you can link them to gear list items."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add equipment
            </Button>
          }
        />
      ) : (
        grouped.map(([cat, catItems]) => (
          <Card key={cat} className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {cat}
            </div>
            <div className="space-y-1">
              {catItems.map((e) => (
                <div key={e.id} className="flex items-center gap-3 py-1.5">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Package className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{e.name}</div>
                    {e.serial_number && (
                      <div className="text-xs text-muted-foreground">{e.serial_number}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New equipment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="IRB Hull #3"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Boats"
                  list="equip-categories"
                />
                <datalist id="equip-categories">
                  {[...new Set([...CATEGORY_ORDER, ...categories])].map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Serial # <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input value={serial} onChange={(e) => setSerial(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={add} disabled={busy || !name.trim()}>
              {busy ? "Saving…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
