import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { EquipmentTabs } from "@/components/equipment/EquipmentTabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, RotateCcw, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/equipment/lists/$listId/pack")({
  head: () => ({ meta: [{ title: "Pack — IRB Coaching" }] }),
  component: PackPage,
});

type Item = { id: string; name: string; category: string; quantity: number; equipment_id: string | null };

function PackPage() {
  const { listId } = Route.useParams();
  const { user } = useAuth();
  const [listName, setListName] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [packed, setPacked] = useState<Set<string>>(new Set());
  const [faultyEquipment, setFaultyEquipment] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: list }, { data: itemRows }] = await Promise.all([
      supabase.from("equipment_lists").select("name").eq("id", listId).maybeSingle(),
      supabase
        .from("equipment_list_items")
        .select("id, name, category, quantity, equipment_id")
        .eq("list_id", listId)
        .order("sort_order")
        .order("created_at"),
    ]);
    setListName(list?.name ?? "");
    const rows = (itemRows ?? []) as Item[];
    setItems(rows);
    if (rows.length) {
      const { data: p } = await supabase
        .from("equipment_list_packed")
        .select("item_id")
        .in("item_id", rows.map((r) => r.id));
      setPacked(new Set((p ?? []).map((r) => r.item_id)));

      const gearIds = rows.map((r) => r.equipment_id).filter(Boolean) as string[];
      if (gearIds.length) {
        const { data: f } = await supabase
          .from("equipment_faults")
          .select("equipment_id")
          .in("equipment_id", gearIds)
          .eq("status", "open");
        setFaultyEquipment(new Set((f ?? []).map((r) => r.equipment_id).filter(Boolean) as string[]));
      } else {
        setFaultyEquipment(new Set());
      }
    }
    setLoading(false);
  }, [listId]);

  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    const out = new Map<string, Item[]>();
    for (const it of items) {
      if (!out.has(it.category)) out.set(it.category, []);
      out.get(it.category)!.push(it);
    }
    return Array.from(out.entries());
  }, [items]);

  const toggle = async (itemId: string, checked: boolean) => {
    if (!user) return;
    // Optimistic update
    setPacked((prev) => {
      const next = new Set(prev);
      if (checked) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
    if (checked) {
      const { error } = await supabase.from("equipment_list_packed").upsert(
        { item_id: itemId, packed_by: user.id, packed_at: new Date().toISOString() },
        { onConflict: "item_id" },
      );
      if (error) { toast.error(error.message); load(); }
    } else {
      const { error } = await supabase
        .from("equipment_list_packed").delete().eq("item_id", itemId);
      if (error) { toast.error(error.message); load(); }
    }
  };

  const reset = async () => {
    if (items.length === 0) return;
    const { error } = await supabase
      .from("equipment_list_packed")
      .delete()
      .in("item_id", items.map((i) => i.id));
    if (error) { toast.error(error.message); return; }
    setPacked(new Set());
    toast.success("Checklist reset");
  };

  const total = items.length;
  const done = items.filter((i) => packed.has(i.id)).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <AppShell title={listName || "Packing"} action={
      <Button asChild size="sm" variant="secondary" className="gap-1">
        <Link to="/equipment/lists"><ArrowLeft className="h-4 w-4" /> Back</Link>
      </Button>
    }>
      <EquipmentTabs />

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No items in this list.</Card>
      ) : (
        <>
          <Card className="p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">{done} of {total} items packed</div>
              <Button size="sm" variant="outline" className="gap-1" onClick={reset}>
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </Button>
            </div>
            <Progress value={pct} />
          </Card>

          <div className="space-y-4">
            {grouped.map(([cat, rows]) => (
              <div key={cat}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{cat}</h3>
                <Card className="divide-y">
                  {rows.map((it) => {
                    const checked = packed.has(it.id);
                    return (
                      <label
                        key={it.id}
                        className="flex items-center gap-3 p-3 cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => toggle(it.id, !!v)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-medium flex items-center gap-2 flex-wrap ${checked ? "line-through text-muted-foreground" : ""}`}>
                            <span className="truncate">{it.name}</span>
                            {it.equipment_id && faultyEquipment.has(it.equipment_id) && (
                              <Badge variant="destructive" className="gap-1 text-[10px] py-0">
                                <AlertTriangle className="h-3 w-3" /> Fault
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground tabular-nums">×{it.quantity}</div>
                      </label>
                    );
                  })}
                </Card>
              </div>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}
