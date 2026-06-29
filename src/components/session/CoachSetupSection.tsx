import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LocationPicker } from "@/components/LocationPicker";

export type VehicleDraft = { name: string; seats: number; pickup: string; can_tow: boolean };
export type ExistingVehicle = {
  id: string; name: string; seats: number; pickup_location: string | null; can_tow: boolean;
};
export type PickupStop = { location: string; leaveTime: string };

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

function to12Hour(t: string): { h12: number; minute: string; meridiem: "AM" | "PM" } {
  const [hStr, mStr] = (t || "17:00").split(":");
  const h24 = parseInt(hStr, 10) || 0;
  return {
    h12: h24 % 12 === 0 ? 12 : h24 % 12,
    minute: MINUTES.includes(mStr ?? "") ? (mStr ?? "00") : "00",
    meridiem: h24 < 12 ? "AM" : "PM",
  };
}

function to24Hour(h12: number, minute: string, meridiem: "AM" | "PM"): string {
  let h24 = h12 % 12;
  if (meridiem === "PM") h24 += 12;
  return `${String(h24).padStart(2, "0")}:${minute}`;
}

function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { h12, minute, meridiem } = to12Hour(value);
  const commit = (next: { h12?: number; minute?: string; meridiem?: "AM" | "PM" }) =>
    onChange(to24Hour(next.h12 ?? h12, next.minute ?? minute, next.meridiem ?? meridiem));
  return (
    <div className="flex gap-1">
      <select
        aria-label="Hour"
        value={h12}
        onChange={(e) => commit({ h12: parseInt(e.target.value, 10) })}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
      >
        {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <select
        aria-label="Minute"
        value={minute}
        onChange={(e) => commit({ minute: e.target.value })}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
      >
        {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <div className="flex h-9 overflow-hidden rounded-md border border-input">
        {(["AM", "PM"] as const).map((ampm, i) => (
          <button
            key={ampm}
            type="button"
            onClick={() => commit({ meridiem: ampm })}
            className={`h-full px-2 text-xs font-medium transition-colors${i > 0 ? " border-l border-input" : ""} ${meridiem === ampm ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
          >
            {ampm}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CoachSetupSection({
  pickups, onPickupsChange,
  trailers, onTrailersChange,
  trailerLocations, onTrailerLocationsChange,
  clubId,
  existingVehicles = [],
  onRemoveExisting,
  pendingVehicles = [],
  onRemovePending,
  newVehicle, onNewVehicleChange,
  onAddVehicle,
}: {
  pickups: PickupStop[];
  onPickupsChange: (v: PickupStop[]) => void;
  trailers: number;
  onTrailersChange: (n: number) => void;
  trailerLocations: string[];
  onTrailerLocationsChange: (v: string[]) => void;
  clubId: string | null | undefined;
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
          <div key={i} className="space-y-1.5 rounded-md border p-2.5">
            <div className="flex gap-2">
              <LocationPicker
                className="flex-1"
                clubId={clubId}
                value={stop.location}
                placeholder={`Stop ${i + 1} e.g. Kurrawa SLSC`}
                onChange={(v) => onPickupsChange(pickups.map((s, idx) => idx === i ? { ...s, location: v } : s))}
              />
              <Button
                type="button" variant="ghost" size="icon"
                onClick={() => onPickupsChange(pickups.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Leave time</Label>
              <TimeSelect
                value={stop.leaveTime}
                onChange={(v) => onPickupsChange(pickups.map((s, idx) => idx === i ? { ...s, leaveTime: v } : s))}
              />
            </div>
          </div>
        ))}
        <Button
          type="button" variant="outline" size="sm"
          onClick={() => onPickupsChange([...pickups, { location: "", leaveTime: "17:00" }])}
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
        {trailers > 0 && (
          <div className="space-y-2">
            {Array.from({ length: trailers }, (_, i) => (
              <div key={i} className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  {trailers === 1 ? "Trailer location" : `Trailer ${i + 1} location`}
                </Label>
                <LocationPicker
                  clubId={clubId}
                  value={trailerLocations[i] ?? ""}
                  onChange={(v) => {
                    const next = [...trailerLocations];
                    next[i] = v;
                    onTrailerLocationsChange(next);
                  }}
                  placeholder="Where the trailer is stored"
                />
              </div>
            ))}
          </div>
        )}
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
          <Input
            type="number" min={1} max={50} placeholder="Seats"
            value={newVehicle.seats}
            onChange={(e) => onNewVehicleChange({ ...newVehicle, seats: Number(e.target.value) })}
          />
          <LocationPicker
            clubId={clubId}
            placeholder="Pickup (optional)"
            value={newVehicle.pickup}
            onChange={(v) => onNewVehicleChange({ ...newVehicle, pickup: v })}
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
