import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClub, useCanManage } from "@/lib/club-context";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { EquipmentTabs } from "@/components/equipment/EquipmentTabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Plus, ListChecks, Package, Pencil, Trash2, MoreVertical, Copy, Archive, ArchiveRestore, Calendar, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";
import { EmptyState } from "@/components/ui/empty-state";

export const Route = createFileRoute("/_app/equipment/lists/")({
  head: () => ({ meta: [{ title: "Packing Lists — IRB Coaching" }] }),
  component: ListsPage,
});

type ListRow = {
  id: string;
  name: string;
  description: string | null;
  event_name: string | null;
  event_date: string | null;
  location: string | null;
  notes: string | null;
  archived_at: string | null;
  items: { id: string; quantity: number }[];
};

function formatDate(d: string | null) {
  if (!d) return null;
  try {
    return new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch { return d; }
}

function ListsPage() {
  const { activeClub } = useClub();
  const canManage = useCanManage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [lists, setLists] = useState<ListRow[]>([]);
  const [packedByList, setPackedByList] = useState<Record<string, number>>({});
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    if (!activeClub) return;
    const { data } = await supabase
      .from("equipment_lists")
      .select("id, name, description, event_name, event_date, location, notes, archived_at, items:equipment_list_items(id, quantity)")
      .eq("club_id", activeClub.club_id)
      .order("event_date", { ascending: true, nullsFirst: false })
      .order("name");
    const rows = (data ?? []) as ListRow[];
    setLists(rows);

    const allItemIds = rows.flatMap((l) => l.items.map((i) => i.id));
    if (allItemIds.length) {
      const { data: packed } = await supabase
        .from("equipment_list_packed")
        .select("item_id")
        .in("item_id", allItemIds);
      const packedSet = new Set((packed ?? []).map((p) => p.item_id));
      const counts: Record<string, number> = {};
      for (const l of rows) {
        counts[l.id] = l.items.filter((i) => packedSet.has(i.id)).length;
      }
      setPackedByList(counts);
    } else {
      setPackedByList({});
    }
  }, [activeClub?.club_id]);

  useEffect(() => { load(); }, [load]);
  useRefetchOnFocus(load);

  const onDelete = async (id: string) => {
    setPendingDelete(null);
    const prev = lists;
    setLists((cur) => cur.filter((l) => l.id !== id));
    const { error } = await supabase.from("equipment_lists").delete().eq("id", id);
    if (error) { toast.error(error.message); setLists(prev); return; }
    toast.success("List deleted");
  };

  const onArchiveToggle = async (l: ListRow) => {
    const archiving = !l.archived_at;
    const value = archiving ? new Date().toISOString() : null;
    const prev = lists;
    setLists((cur) => cur.map((x) => (x.id === l.id ? { ...x, archived_at: value } : x)));
    const { error } = await supabase
      .from("equipment_lists")
      .update({ archived_at: value } as never)
      .eq("id", l.id);
    if (error) { toast.error(error.message); setLists(prev); return; }
    toast.success(archiving ? "List archived" : "List restored");
  };

  const onDuplicate = async (l: ListRow) => {
    if (!user || !activeClub) return;
    const { data: full } = await supabase
      .from("equipment_lists")
      .select("name, description, event_name, event_date, location, notes")
      .eq("id", l.id)
      .maybeSingle();
    const { data: srcItems } = await supabase
      .from("equipment_list_items")
      .select("name, category, quantity, sort_order, equipment_id")
      .eq("list_id", l.id)
      .order("sort_order");
    if (!full) { toast.error("Couldn't load source list"); return; }
    const { data: newList, error } = await supabase
      .from("equipment_lists")
      .insert({
        club_id: activeClub.club_id,
        created_by: user.id,
        name: `${full.name} (copy)`,
        description: full.description,
        event_name: (full as { event_name?: string | null }).event_name ?? null,
        event_date: (full as { event_date?: string | null }).event_date ?? null,
        location: (full as { location?: string | null }).location ?? null,
        notes: (full as { notes?: string | null }).notes ?? null,
      } as never)
      .select("id")
      .single();
    if (error || !newList) { toast.error(error?.message ?? "Couldn't duplicate"); return; }
    if (srcItems && srcItems.length) {
      const inserts = srcItems.map((it) => ({
        list_id: newList.id,
        name: it.name,
        category: it.category,
        quantity: it.quantity,
        sort_order: it.sort_order,
        equipment_id: (it as { equipment_id?: string | null }).equipment_id ?? null,
      }));
      const { error: insErr } = await supabase.from("equipment_list_items").insert(inserts as never);
      if (insErr) { toast.error(insErr.message); return; }
    }
    toast.success("List duplicated");
    load();
  };

  const visible = useMemo(
    () => lists.filter((l) => (showArchived ? !!l.archived_at : !l.archived_at)),
    [lists, showArchived]
  );
  const archivedCount = lists.filter((l) => !!l.archived_at).length;

  if (!activeClub) {
    return <AppShell><div className="py-12 text-center text-sm text-muted-foreground">Select a club first.</div></AppShell>;
  }

  return (
    <AppShell title="Packing Lists" action={
      canManage ? (
        <Button size="sm" variant="secondary" className="gap-1" onClick={() => navigate({ to: "/equipment/lists/new" })}>
          <Plus className="h-4 w-4" /> New
        </Button>
      ) : undefined
    }>
      <EquipmentTabs />

      {archivedCount > 0 && (
        <div className="flex justify-end mb-3">
          <Button size="sm" variant="ghost" className="text-xs gap-1" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Show active" : `Show archived (${archivedCount})`}
          </Button>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-5 w-5" />}
          title={showArchived ? "No archived lists" : "No packing lists yet"}
          description={showArchived
            ? "Archived lists will appear here."
            : "Build reusable kit lists — training, competition, travel — so members can check items off before every session."}
          action={canManage && !showArchived ? (
            <Button onClick={() => navigate({ to: "/equipment/lists/new" })}>
              <Plus className="h-4 w-4 mr-1" /> Create your first list
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-3">
          {visible.map((l) => {
            const total = l.items.length;
            const totalUnits = l.items.reduce((s, i) => s + i.quantity, 0);
            const done = packedByList[l.id] ?? 0;
            const pct = total === 0 ? 0 : Math.round((done / total) * 100);
            const dateText = formatDate(l.event_date);
            return (
              <Card key={l.id} className={`p-4 ${l.archived_at ? "opacity-75" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <ListChecks className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold truncate">{l.name}</div>
                      {l.archived_at && <Badge variant="outline" className="text-[10px]">Archived</Badge>}
                      {!l.archived_at && total > 0 && pct === 100 && <Badge variant="success" className="text-[10px]">Ready</Badge>}
                    </div>
                    {(l.event_name || dateText || l.location) && (
                      <div className="mt-0.5 text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                        {l.event_name && <span className="truncate">{l.event_name}</span>}
                        {dateText && <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{dateText}</span>}
                        {l.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{l.location}</span>}
                      </div>
                    )}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {total} {total === 1 ? "item" : "items"} · {totalUnits} {totalUnits === 1 ? "unit" : "units"}
                    </div>
                  </div>
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="List actions">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => navigate({ to: "/equipment/lists/$listId/edit", params: { listId: l.id } })}>
                          <Pencil className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onDuplicate(l)}>
                          <Copy className="h-4 w-4 mr-2" /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onArchiveToggle(l)}>
                          {l.archived_at
                            ? <><ArchiveRestore className="h-4 w-4 mr-2" /> Restore</>
                            : <><Archive className="h-4 w-4 mr-2" /> Archive</>}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => setPendingDelete(l.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {total > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                      <span>{done} of {total} packed</span>
                      <span className="tabular-nums">{pct}%</span>
                    </div>
                    <Progress value={pct} />
                  </div>
                )}

                <div className="mt-3 flex gap-2">
                  <Button asChild size="sm" className="flex-1 gap-1">
                    <Link to="/equipment/lists/$listId/pack" params={{ listId: l.id }}>
                      <Package className="h-4 w-4" /> Pack
                    </Link>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this list?</AlertDialogTitle>
            <AlertDialogDescription>
              The list and all its items will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingDelete && onDelete(pendingDelete)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
