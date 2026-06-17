import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useClub, useCanManage } from "@/lib/club-context";
import { useConfirm } from "@/lib/confirm";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MapPin, Plus, Trash2, Pencil, X, Check, Home } from "lucide-react";
import { toast } from "sonner";
import { AddressAutocomplete } from "./AddressAutocomplete";

type Loc = { id: string; name: string; address: string | null; is_default: boolean };

export function LocationsSection() {
  const { user } = useAuth();
  const { activeClub } = useClub();
  const canManage = useCanManage();
  const confirm = useConfirm();

  const [items, setItems] = useState<Loc[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");

  const clubId = activeClub?.club_id;

  const refresh = async () => {
    if (!clubId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("locations")
      .select("id, name, address, is_default")
      .eq("club_id", clubId)
      .order("name");
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setItems((data as Loc[]) ?? []);
  };

  useEffect(() => { refresh(); }, [clubId]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clubId || !user) return;
    if (!name.trim()) { toast.error("Name is required."); return; }
    setSaving(true);
    const { error } = await supabase.from("locations").insert({
      club_id: clubId,
      name: name.trim(),
      address: address.trim() || null,
      created_by: user.id,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setName(""); setAddress("");
    toast.success("Location added");
    refresh();
  };

  const startEdit = (loc: Loc) => {
    setEditingId(loc.id);
    setEditName(loc.name);
    setEditAddress(loc.address ?? "");
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim()) { toast.error("Name is required."); return; }
    const { error } = await supabase
      .from("locations")
      .update({ name: editName.trim(), address: editAddress.trim() || null })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    setEditingId(null);
    toast.success("Location updated");
    refresh();
  };

  const setAsHome = async (id: string) => {
    if (!clubId) return;
    const { error: clearError } = await supabase
      .from("locations")
      .update({ is_default: false })
      .eq("club_id", clubId);
    if (clearError) { toast.error(clearError.message); return; }
    const { error } = await supabase
      .from("locations")
      .update({ is_default: true })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Home beach set");
    refresh();
  };

  const remove = async (id: string, locName: string) => {
    const ok = await confirm({
      title: "Delete this location?",
      description: `"${locName}" will be removed from the saved locations list.`,
    });
    if (!ok) return;
    const { error } = await supabase.from("locations").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removed");
    refresh();
  };

  if (!canManage) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Only coaches and admins can manage saved locations.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Add the venues, pools and carpool pickup/drop-off points your club uses. They’ll appear as
        pickable options when creating sessions and configuring carpool pickups.
      </p>
      <p className="text-xs text-muted-foreground">
        The home beach is used for the dashboard's "Today" weather, surf and tides — works best with a full street address.
      </p>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Plus className="h-4 w-4 text-primary" />
          <div className="text-sm font-semibold">Add a location</div>
        </div>
        <form onSubmit={add} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="loc-name">Name</Label>
            <Input id="loc-name" placeholder="e.g. Miami Pool" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loc-addr">Address (optional)</Label>
            <AddressAutocomplete id="loc-addr" placeholder="e.g. 80 Pacific Ave, Miami QLD 4220" value={address} onChange={setAddress} />
          </div>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Add location"}</Button>
        </form>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="h-4 w-4 text-primary" />
          <div className="text-sm font-semibold">Saved ({items.length})</div>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No saved locations yet. Add club venues and pickup spots above so they're a tap away when scheduling sessions or carpools.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((l) => (
              <div key={l.id} className="rounded-lg border p-3">
                {editingId === l.id ? (
                  <div className="space-y-2">
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" />
                    <AddressAutocomplete value={editAddress} onChange={setEditAddress} placeholder="Address" />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveEdit(l.id)}>
                        <Check className="h-4 w-4 mr-1" /> Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        <X className="h-4 w-4 mr-1" /> Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-sm truncate">{l.name}</div>
                        {l.is_default && (
                          <Badge variant="secondary" className="gap-1 shrink-0">
                            <Home className="h-3 w-3" /> Home beach
                          </Badge>
                        )}
                      </div>
                      {l.address && (
                        <div className="text-xs text-muted-foreground truncate">{l.address}</div>
                      )}
                      {!l.is_default && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-1.5 h-7 text-xs"
                          onClick={() => setAsHome(l.id)}
                        >
                          Set as home beach
                        </Button>
                      )}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(l)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(l.id, l.name)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
