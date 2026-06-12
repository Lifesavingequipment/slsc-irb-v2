import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Tag, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/lib/confirm";

type Row = { id: string; name: string };

export function CategoriesManager({ clubId, trigger }: { clubId: string; trigger: React.ReactNode }) {
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("equipment_categories")
      .select("id, name")
      .eq("club_id", clubId)
      .order("sort_order").order("name");
    setRows((data ?? []) as Row[]);
  };

  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open, clubId]);

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    const { error } = await supabase
      .from("equipment_categories")
      .insert({ club_id: clubId, name } as never);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setNewName("");
    toast.success("Category added");
    load();
  };

  const saveEdit = async (id: string) => {
    const name = editValue.trim();
    if (!name) { toast.error("Name required"); return; }
    const { error } = await supabase
      .from("equipment_categories")
      .update({ name } as never)
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    setEditingId(null);
    toast.success("Renamed");
    load();
  };

  const remove = async (id: string, name: string) => {
    const ok = await confirm({
      title: "Delete this category?",
      description: `"${name}" will be removed. Equipment using it keeps the label until you re-assign it.`,
    });
    if (!ok) return;
    const prev = rows;
    setRows((r) => r.filter((x) => x.id !== id));
    const { error } = await supabase.from("equipment_categories").delete().eq("id", id);
    if (error) { setRows(prev); toast.error(error.message); return; }
    toast.success("Category removed");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Equipment categories</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">
          These appear in the category picker when adding or editing gear. Existing equipment using a removed
          category keeps its label until you re-assign it.
        </p>

        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New category name"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          />
          <Button type="button" onClick={add} disabled={busy || !newName.trim()} className="gap-1">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto space-y-1">
          {rows.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No categories yet.</div>
          ) : rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-lg border p-2">
              <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
              {editingId === r.id ? (
                <>
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="h-8"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveEdit(r.id); } }}
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => saveEdit(r.id)} aria-label="Save">
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(null)} aria-label="Cancel">
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm truncate">{r.name}</span>
                  <Button size="icon" variant="ghost" className="h-8 w-8"
                    onClick={() => { setEditingId(r.id); setEditValue(r.name); }}
                    aria-label="Rename">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                    onClick={() => remove(r.id, r.name)} aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
