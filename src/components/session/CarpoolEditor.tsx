import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DateTimeFields } from "@/components/ui/date-time-fields";
import { Plus, Trash2, Car, MapPin } from "lucide-react";
import { memberFullName } from "@/lib/names";

type SavedLocation = { id: string; name: string; address: string | null };

function SavedLocationPicker({ locations, onPick }: { locations: SavedLocation[]; onPick: (v: string) => void }) {
  if (locations.length === 0) return null;
  return (
    <div className="flex items-center gap-1">
      <Select onValueChange={(id) => {
        const loc = locations.find((l) => l.id === id);
        if (loc) onPick(loc.address ? `${loc.name} — ${loc.address}` : loc.name);
      }}>
        <SelectTrigger className="h-7 text-xs w-auto gap-1 px-2">
          <MapPin className="h-3 w-3" />
          <SelectValue placeholder="Insert saved location" />
        </SelectTrigger>
        <SelectContent>
          {locations.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              <div className="flex flex-col">
                <span className="text-sm">{l.name}</span>
                {l.address && <span className="text-xs text-muted-foreground">{l.address}</span>}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export type CarpoolDraft = {
  // present when editing an existing carpool row
  id?: string;
  driver_user_id: string;
  vehicle_name: string;
  departure_location: string;
  departure_time: string; // local datetime-local string
  available_seats: number;
  notes: string;
  can_tow_trailer: boolean;
};

export function emptyCarpoolDraft(defaultDriverId: string, defaultDeparture = ""): CarpoolDraft {
  return {
    driver_user_id: defaultDriverId,
    vehicle_name: "",
    departure_location: "",
    departure_time: defaultDeparture,
    available_seats: 4,
    notes: "",
    can_tow_trailer: false,
  };
}

type Member = { user_id: string; display_name: string };

interface Props {
  clubId: string | null | undefined;
  currentUserId: string;
  canPickAnyDriver: boolean; // admins + coaches
  value: CarpoolDraft[];
  onChange: (next: CarpoolDraft[]) => void;
  defaultDeparture?: string;
  savedLocations?: SavedLocation[];
}

export function CarpoolEditor({
  clubId, currentUserId, canPickAnyDriver, value, onChange, defaultDeparture, savedLocations = [],
}: Props) {
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    if (!clubId || !canPickAnyDriver) return;
    let cancelled = false;
    (async () => {
      const { data: memData } = await supabase
        .from("members")
        .select("id, auth_user_id, first_name, last_name, preferred_name")
        .eq("club_id", clubId)
        .eq("membership_status", "active")
        .order("first_name");
      if (cancelled) return;
      const rows: Member[] = (memData ?? []).map((m) => ({
        user_id: m.auth_user_id ?? m.id,
        display_name: memberFullName(m, "Member"),
      }));
      rows.sort((a, b) => a.display_name.localeCompare(b.display_name));
      setMembers(rows);
    })();
    return () => { cancelled = true; };
  }, [clubId, canPickAnyDriver]);

  const nameFor = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m) => map.set(m.user_id, m.display_name || "Member"));
    if (!map.has(currentUserId)) map.set(currentUserId, "You");
    return (id: string) => map.get(id) || "Member";
  }, [members, currentUserId]);

  const update = (i: number, patch: Partial<CarpoolDraft>) => {
    onChange(value.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  };
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => onChange([...value, emptyCarpoolDraft(currentUserId, defaultDeparture ?? "")]);

  return (
    <div className="space-y-3">
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No vehicles yet. Add one below or save the session and let members offer rides.
        </p>
      )}
      {value.map((row, i) => (
        <Card key={i} className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Car className="h-4 w-4" /> Vehicle {i + 1}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)} className="h-8 px-2 text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Driver</Label>
              {canPickAnyDriver ? (
                <Select value={row.driver_user_id} onValueChange={(v) => update(i, { driver_user_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {!members.find((m) => m.user_id === currentUserId) && (
                      <SelectItem value={currentUserId}>You</SelectItem>
                    )}
                    {members.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.full_name || "Member"}{m.user_id === currentUserId ? " (you)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={nameFor(row.driver_user_id)} disabled />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Vehicle</Label>
              <Input
                value={row.vehicle_name}
                onChange={(e) => update(i, { vehicle_name: e.target.value })}
                placeholder="Black Hilux"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Departure location</Label>
            <Input
              value={row.departure_location}
              onChange={(e) => update(i, { departure_location: e.target.value })}
              placeholder="Clubhouse car park"
            />
            <SavedLocationPicker
              locations={savedLocations}
              onPick={(v) => update(i, { departure_location: v })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Departure time</Label>
              <DateTimeFields
                value={row.departure_time}
                onChange={(v) => update(i, { departure_time: v })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Available seats</Label>
              <Input
                type="number"
                min={0}
                max={50}
                value={row.available_seats}
                onChange={(e) => update(i, { available_seats: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border p-2.5">
            <div className="text-sm">Can tow trailer</div>
            <Switch checked={row.can_tow_trailer} onCheckedChange={(v) => update(i, { can_tow_trailer: v })} />
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={row.notes} onChange={(e) => update(i, { notes: e.target.value })} />
          </div>
        </Card>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={add} className="h-9">
        <Plus className="h-4 w-4 mr-1" /> Add vehicle
      </Button>
    </div>
  );
}

export function validateCarpoolDrafts(drafts: CarpoolDraft[]): string | null {
  for (const [i, d] of drafts.entries()) {
    if (!d.driver_user_id) return `Vehicle ${i + 1}: pick a driver.`;
    if (!d.vehicle_name.trim()) return `Vehicle ${i + 1}: enter a vehicle name.`;
    if (!d.departure_location.trim()) return `Vehicle ${i + 1}: enter a departure location.`;
    if (!d.departure_time) return `Vehicle ${i + 1}: pick a departure time.`;
    if (Number.isNaN(new Date(d.departure_time).getTime())) return `Vehicle ${i + 1}: invalid departure time.`;
    if (d.available_seats < 0 || d.available_seats > 50) return `Vehicle ${i + 1}: seats must be between 0 and 50.`;
  }
  // No duplicate drivers in the same session.
  const drivers = new Set<string>();
  for (const [i, d] of drafts.entries()) {
    if (drivers.has(d.driver_user_id)) return `Vehicle ${i + 1}: this driver already has a vehicle on this session.`;
    drivers.add(d.driver_user_id);
  }
  return null;
}
