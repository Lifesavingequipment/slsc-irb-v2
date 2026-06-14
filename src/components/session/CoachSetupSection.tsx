import { Plus, Trash2, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type VehicleDraft = { name: string; seats: number; pickup: string; can_tow: boolean };
export type CoachSavedLocation = { id: string; name: string; address: string | null };
export type ExistingVehicle = {
  id: string; name: string; seats: number; pickup_location: string | null; can_tow: boolean;
};

function formatLocation(l: CoachSavedLocation): string {
  return l.address ? `${l.name} — ${l.address}` : l.name;
}

function SavedLocationPicker({
  locations, onPick,
}: { locations: CoachSavedLocation[]; onPick: (v: string) => void }) {
  if (locations.length === 0) return null;
  return (
    <div className="flex items-center gap-1">
      <Select onValueChange={(id) => {
        const loc = locations.find((l) => l.id === id);
        if (loc) onPick(formatLocation(loc));
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

export function CoachSetupSection({
  pickups, onPickupsChange,
  trailers, onTrailersChange,
  savedLocations,
  existingVehicles = [],
  onRemoveExisting,
  pendingVehicles = [],
  onRemovePending,
  newVehicle, onNewVehicleChange,
  onAddVehicle,
}: {
  pickups: string[];
  onPickupsChange: (v: string[]) => void;
  trailers: number;
  onTrailersChange: (n: number) => void;
  savedLocations: CoachSavedLocation[];
  existingVehicles?: ExistingVehicle[];
  onRemoveExisting?: (id: string) => void;
  pendingVehicles?: VehicleDraft[];
  onRemovePending?: (i: number) => void;
  newVehicle: VehicleDraft;
  onNewVehicleChange: (v: VehicleDraft) => void;
  onAddVehicle: () => void;
}) {
  return (
    <div className="border-t pt-3 mt-1 space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Coach setup</p>

      {/* Pickup stops */}
      <section className="space-y-2">
        <Label className="text-sm font-semibold">Pickup stops</Label>
        <p className="text-xs text-muted-foreground">Members pick from these when requesting a ride.</p>
        {pickups.map((stop, i) => (
          <div key={i} className="space-y-1">
            <div className="flex gap-2">
              <Input
                value={stop}
                placeholder={`Stop ${i + 1} e.g. Kurrawa SLSC (5:00pm)`}
                onChange={(e) => onPickupsChange(pickups.map((s, idx) => idx === i ? e.target.value : s))}
              />
              <Button
                type="button" variant="ghost" size="icon"
                onClick={() => onPickupsChange(pickups.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <SavedLocationPicker
              locations={savedLocations}
              onPick={(v) => onPickupsChange(pickups.map((s, idx) => idx === i ? v : s))}
            />
          </div>
        ))}
        <Button
          type="button" variant="outline" size="sm"
          onClick={() => onPickupsChange([...pickups, ""])}
        >
          <Plus className="h-3 w-3 mr-1" /> Add stop
        </Button>
      </section>

      {/* Trailers required */}
      <section className="space-y-2">
        <Label className="text-sm font-semibold">Trailers required</Label>
        <Select value={String(trailers)} onValueChange={(v) => onTrailersChange(Number(v))}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <SelectItem key={n} value={String(n)}>{n} trailer{n === 1 ? "" : "s"}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      {/* Club vehicles */}
      <section className="space-y-2">
        <Label className="text-sm font-semibold">Club vehicles</Label>
        <p className="text-xs text-muted-foreground">Bus, van, or any club-owned vehicle attending this session.</p>

        {existingVehicles.length > 0 && (
          <div className="space-y-1">
            {existingVehicles.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{v.name}</span>
                    <Badge variant="secondary">{v.seats}</Badge>
                    {v.can_tow && <Badge variant="outline" className="text-xs">Tow</Badge>}
                  </div>
                  {v.pickup_location && (
                    <div className="text-xs text-muted-foreground">{v.pickup_location}</div>
                  )}
                </div>
                {onRemoveExisting && (
                  <Button
                    type="button" size="icon" variant="ghost"
                    onClick={() => onRemoveExisting(v.id)}
                    aria-label={`Remove ${v.name}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {pendingVehicles.length > 0 && (
          <div className="space-y-1">
            {pendingVehicles.map((v, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border border-dashed p-2 text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{v.name}</span>
                    <Badge variant="secondary">{v.seats}</Badge>
                    {v.can_tow && <Badge variant="outline" className="text-xs">Tow</Badge>}
                  </div>
                  {v.pickup && <div className="text-xs text-muted-foreground">{v.pickup}</div>}
                </div>
                {onRemovePending && (
                  <Button
                    type="button" size="icon" variant="ghost"
                    onClick={() => onRemovePending(i)}
                    aria-label={`Remove ${v.name}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="rounded-md border p-3 space-y-2">
          <Input
            placeholder="Vehicle name (e.g. Club Bus)"
            value={newVehicle.name}
            onChange={(e) => onNewVehicleChange({ ...newVehicle, name: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number" min={1} max={50} placeholder="Seats"
              value={newVehicle.seats}
              onChange={(e) => onNewVehicleChange({ ...newVehicle, seats: Number(e.target.value) })}
            />
            <Input
              placeholder="Pickup (optional)"
              value={newVehicle.pickup}
              onChange={(e) => onNewVehicleChange({ ...newVehicle, pickup: e.target.value })}
            />
          </div>
          <SavedLocationPicker
            locations={savedLocations}
            onPick={(v) => onNewVehicleChange({ ...newVehicle, pickup: v })}
          />
          <div className="flex items-center justify-between">
            <Label className="text-sm">Can tow trailer</Label>
            <Switch
              checked={newVehicle.can_tow}
              onCheckedChange={(v) => onNewVehicleChange({ ...newVehicle, can_tow: v })}
            />
          </div>
          <Button type="button" size="sm" onClick={onAddVehicle} className="w-full">
            <Plus className="h-3 w-3 mr-1" /> Add vehicle
          </Button>
        </div>
      </section>
    </div>
  );
}
