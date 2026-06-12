import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export type CategoryRow = { id: string; name: string };

const ADD_NEW = "__add_new__";

export function useCategories(clubId: string | undefined) {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = async () => {
    if (!clubId) return;
    setLoading(true);
    const { data } = await supabase
      .from("equipment_categories")
      .select("id, name")
      .eq("club_id", clubId)
      .order("sort_order")
      .order("name");
    setCategories((data ?? []) as CategoryRow[]);
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clubId]);

  return { categories, loading, reload, setCategories };
}

export function CategoryPicker({
  value, onChange, clubId, canManage, placeholder = "Select category",
}: {
  value: string;
  onChange: (v: string) => void;
  clubId: string;
  canManage: boolean;
  placeholder?: string;
}) {
  const { categories, reload } = useCategories(clubId);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  // Ensure current value appears even if it isn't in the managed list (legacy free-text)
  const valueMissing = value && !categories.some((c) => c.name === value);

  const handleChange = (v: string) => {
    if (v === ADD_NEW) {
      if (canManage) setAddOpen(true);
      return;
    }
    onChange(v);
  };

  const addNew = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("equipment_categories")
      .insert({ club_id: clubId, name } as never)
      .select("id, name")
      .single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Category added");
    setNewName("");
    setAddOpen(false);
    await reload();
    if (data) onChange((data as CategoryRow).name);
  };

  return (
    <>
      <Select value={value || undefined} onValueChange={handleChange}>
        <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {valueMissing && <SelectItem value={value}>{value}</SelectItem>}
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
          ))}
          {canManage && (
            <>
              {(categories.length > 0 || valueMissing) && <SelectSeparator />}
              <SelectItem value={ADD_NEW}>
                <span className="inline-flex items-center gap-1.5 text-primary">
                  <Plus className="h-3.5 w-3.5" /> Add new category…
                </span>
              </SelectItem>
            </>
          )}
        </SelectContent>
      </Select>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New category</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Radios"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNew(); } }}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="button" disabled={busy || !newName.trim()} onClick={addNew}>
              {busy ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
