import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { currentMemberId } from "@/lib/notify";
import { memberFullName } from "@/lib/names";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
import { Badge } from "@/components/ui/badge";
import { ListChecks, Package, Settings2 } from "lucide-react";
import { toast } from "sonner";

type ListItem = {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  sort_order: number | null;
  equipment_id: string | null;
  equipment: { id: string; name: string; serial_number: string | null } | null;
};

type Check = { id: string; list_item_id: string; checked_by: string; checked_at: string };

type GearList = { id: string; name: string };

// Coaches see categories in this order; anything else falls to the bottom (A–Z).
const CATEGORY_ORDER = ["Boats", "Engines", "Safety", "Buoys & Anchors", "Other"];

function categoryRank(cat: string): number {
  const i = CATEGORY_ORDER.findIndex((c) => c.toLowerCase() === cat.toLowerCase());
  return i === -1 ? CATEGORY_ORDER.length : i;
}

export function GearChecklistPanel({
  sessionId,
  clubId,
  canManage,
  equipmentListId,
  onListChange,
}: {
  sessionId: string;
  clubId: string;
  canManage: boolean;
  equipmentListId: string | null;
  onListChange: (listId: string | null) => void;
}) {
  const [listName, setListName] = useState<string | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [nameByMemberId, setNameByMemberId] = useState<Record<string, string>>({});
  const [myMemberId, setMyMemberId] = useState<string | null>(null);
  const [allLists, setAllLists] = useState<GearList[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerValue, setPickerValue] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Resolve the current user's member id once (used as checked_by on inserts).
  useEffect(() => {
    currentMemberId(clubId).then(setMyMemberId);
  }, [clubId]);

  // Club member name map for the "who checked it" line.
  useEffect(() => {
    supabase
      .from("members")
      .select("id, first_name, last_name, preferred_name")
      .eq("club_id", clubId)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        for (const m of data ?? []) map[m.id] = memberFullName(m, "Member").split(/\s+/)[0];
        setNameByMemberId(map);
      });
  }, [clubId]);

  const loadList = useCallback(async () => {
    if (!equipmentListId) {
      setListName(null);
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: list }, { data: itemRows }] = await Promise.all([
      supabase.from("equipment_lists").select("name").eq("id", equipmentListId).maybeSingle(),
      supabase
        .from("equipment_list_items")
        .select(
          "id, name, category, quantity, sort_order, equipment_id, equipment:equipment(id, name, serial_number)",
        )
        .eq("list_id", equipmentListId)
        .order("sort_order", { nullsFirst: true })
        .order("name"),
    ]);
    setListName(list?.name ?? null);
    setItems((itemRows ?? []) as unknown as ListItem[]);
    setLoading(false);
  }, [equipmentListId]);

  const loadChecks = useCallback(async () => {
    const { data } = await supabase
      .from("session_gear_checks")
      .select("id, list_item_id, checked_by, checked_at")
      .eq("session_id", sessionId);
    const map: Record<string, Check> = {};
    for (const c of data ?? []) map[c.list_item_id] = c as Check;
    setChecks(map);
  }, [sessionId]);

  useEffect(() => {
    loadList();
  }, [loadList]);
  useEffect(() => {
    loadChecks();
  }, [loadChecks]);

  // Realtime: everyone watching this session sees check-offs as they happen.
  useEffect(() => {
    const channel = supabase
      .channel(`gear-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_gear_checks",
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          loadChecks();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionId, loadChecks]);

  const loadAllLists = useCallback(async () => {
    const { data } = await supabase
      .from("equipment_lists")
      .select("id, name")
      .eq("club_id", clubId)
      .is("archived_at", null)
      .order("name");
    setAllLists((data ?? []) as GearList[]);
  }, [clubId]);

  const openPicker = () => {
    setPickerValue(equipmentListId ?? "");
    loadAllLists();
    setPickerOpen(true);
  };

  const savePicker = async () => {
    const next = pickerValue || null;
    const { error } = await supabase
      .from("sessions")
      .update({ equipment_list_id: next })
      .eq("id", sessionId);
    if (error) {
      toast.error(error.message);
      return;
    }
    onListChange(next);
    setPickerOpen(false);
    toast.success(next ? "Gear list attached" : "Gear list removed");
  };

  const toggle = async (itemId: string) => {
    const existing = checks[itemId];
    if (existing) {
      // Optimistic remove; realtime/refetch reconciles.
      setChecks((cur) => {
        const next = { ...cur };
        delete next[itemId];
        return next;
      });
      const { error } = await supabase.from("session_gear_checks").delete().eq("id", existing.id);
      if (error) {
        toast.error(error.message);
        loadChecks();
      }
      return;
    }
    if (!myMemberId) {
      toast.error("Could not identify your membership");
      return;
    }
    const optimistic: Check = {
      id: `optimistic-${itemId}`,
      list_item_id: itemId,
      checked_by: myMemberId,
      checked_at: new Date().toISOString(),
    };
    setChecks((cur) => ({ ...cur, [itemId]: optimistic }));
    const { data, error } = await supabase
      .from("session_gear_checks")
      .insert({ session_id: sessionId, list_item_id: itemId, checked_by: myMemberId })
      .select("id, list_item_id, checked_by, checked_at")
      .maybeSingle();
    if (error) {
      toast.error(error.message);
      loadChecks();
      return;
    }
    if (data) setChecks((cur) => ({ ...cur, [itemId]: data as Check }));
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

  const total = items.length;
  const done = items.filter((i) => checks[i.id]).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  if (loading && equipmentListId) {
    return (
      <Card className="p-4 text-center text-sm text-muted-foreground">Loading gear list…</Card>
    );
  }

  // No list attached yet.
  if (!equipmentListId) {
    return (
      <>
        <Card className="p-6 text-center">
          <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <Package className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="text-sm font-medium">No gear list attached</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {canManage
              ? "Attach a reusable gear list so members can check items off before the session."
              : "A coach hasn't attached a gear list for this session yet."}
          </p>
          {canManage && (
            <Button className="mt-4" size="sm" onClick={openPicker}>
              <ListChecks className="h-4 w-4 mr-1.5" /> Attach a gear list
            </Button>
          )}
        </Card>
        <ListPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          lists={allLists}
          value={pickerValue}
          onValueChange={setPickerValue}
          onSave={savePicker}
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary shrink-0" />
              <div className="font-semibold truncate">{listName ?? "Gear list"}</div>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {done} / {total} packed
            </div>
          </div>
          {canManage && (
            <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={openPicker}>
              <Settings2 className="h-3.5 w-3.5" /> Change list
            </Button>
          )}
        </div>
        {total > 0 && <Progress value={pct} className="mt-3" />}
      </Card>

      {total === 0 ? (
        <Card className="p-4 text-center text-sm text-muted-foreground">
          This list has no items yet.{" "}
          {canManage && (
            <Link
              to="/equipment/lists/$listId/edit"
              params={{ listId: equipmentListId }}
              className="text-accent underline"
            >
              Add some
            </Link>
          )}
        </Card>
      ) : (
        grouped.map(([cat, catItems]) => (
          <Card key={cat} className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {cat}
            </div>
            <div className="space-y-1">
              {catItems.map((it) => {
                const check = checks[it.id];
                const checked = !!check;
                const who = check ? (nameByMemberId[check.checked_by] ?? "Member") : null;
                return (
                  <div key={it.id} className="flex items-start gap-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => toggle(it.id)}
                      className={`mt-0.5 h-6 w-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                        checked
                          ? "bg-primary border-primary text-white"
                          : "border-muted-foreground/40"
                      }`}
                      aria-label={checked ? "Uncheck" : "Check"}
                    >
                      {checked && <span className="text-xs">✓</span>}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-sm font-medium ${checked ? "text-muted-foreground" : ""}`}
                      >
                        {it.quantity}x {it.name}
                      </div>
                      {it.equipment && (
                        <div className="mt-0.5">
                          <Badge variant="secondary" className="text-[10px] font-normal">
                            {it.equipment.name}
                            {it.equipment.serial_number ? ` · ${it.equipment.serial_number}` : ""}
                          </Badge>
                        </div>
                      )}
                      {checked && check && (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {who} ·{" "}
                          {formatDistanceToNow(new Date(check.checked_at), { addSuffix: true })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))
      )}

      <ListPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        lists={allLists}
        value={pickerValue}
        onValueChange={setPickerValue}
        onSave={savePicker}
      />
    </div>
  );
}

function ListPickerDialog({
  open,
  onOpenChange,
  lists,
  value,
  onValueChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lists: GearList[];
  value: string;
  onValueChange: (v: string) => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gear checklist</DialogTitle>
        </DialogHeader>
        {lists.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No gear lists yet. Create one in{" "}
            <Link to="/more/gear-lists" className="text-accent underline">
              More → Gear Lists
            </Link>
            .
          </p>
        ) : (
          <Select
            value={value || "__none"}
            onValueChange={(v) => onValueChange(v === "__none" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a list…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">No gear list</SelectItem>
              {lists.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
