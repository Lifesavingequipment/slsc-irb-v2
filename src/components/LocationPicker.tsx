import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete } from "@/components/settings/AddressAutocomplete";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type SavedLocation = { id: string; name: string; address: string | null };

/** Compose the value string stored on the consuming form for a saved location. */
export function formatLocation(l: SavedLocation): string {
  return l.address ? `${l.name} — ${l.address}` : l.name;
}

type Props = {
  /** Current location text (a saved location's "Name — Address" or a free-typed address). */
  value: string;
  /** Called whenever the location text changes. */
  onChange: (value: string) => void;
  /** Club whose saved locations are shown / new ones are saved to. Null disables the saved list. */
  clubId: string | null | undefined;
  placeholder?: string;
  id?: string;
  className?: string;
  /**
   * Optional: reports the id of the chosen saved location (or null when a custom
   * address is used). Lets forms that track a `location_id` FK keep it in sync.
   */
  onLocationIdChange?: (id: string | null) => void;
};

/**
 * Reusable location field used across sessions, carpools and onboarding.
 *
 * - Lists the club's saved locations in a dropdown.
 * - Falls back to an address autocomplete for new addresses.
 * - After picking a new address, offers to save it back to the club's locations.
 */
export function LocationPicker({
  value,
  onChange,
  clubId,
  placeholder = "Type an address or place name",
  id,
  className,
  onLocationIdChange,
}: Props) {
  const { user } = useAuth();
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Inline "Save this location?" prompt, shown after a fresh address is selected.
  const [savePrompt, setSavePrompt] = useState<{ address: string; name: string } | null>(null);

  // Guards a refetch-induced flicker; we keep the latest clubId we loaded for.
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!clubId) {
      setLocations([]);
      setLoading(false);
      loadedFor.current = null;
      return;
    }
    setLoading(true);
    supabase
      .from("locations")
      .select("id, name, address")
      .eq("club_id", clubId)
      .order("name")
      .then(({ data }) => {
        if (cancelled) return;
        setLocations((data ?? []) as SavedLocation[]);
        setLoading(false);
        loadedFor.current = clubId;
      });
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  const selected = locations.find((l) => formatLocation(l) === value) ?? null;

  const pickSaved = (l: SavedLocation) => {
    setSavePrompt(null);
    onChange(formatLocation(l));
    onLocationIdChange?.(l.id);
  };

  // Plain typing / clearing the field: treat as a custom (unsaved) address.
  const handleTyped = (v: string) => {
    onChange(v);
    onLocationIdChange?.(null);
    if (!v.trim()) setSavePrompt(null);
  };

  // A suggestion was picked from the autocomplete dropdown — offer to save it.
  const handleSelected = (address: string) => {
    onLocationIdChange?.(null);
    const exists = locations.some(
      (l) => l.address === address || formatLocation(l) === address,
    );
    if (clubId && !exists) {
      setSavePrompt({ address, name: address.split(",")[0].trim() });
    }
  };

  const saveNewLocation = async () => {
    if (!clubId || !savePrompt) return;
    const name = savePrompt.name.trim();
    if (!name) {
      toast.error("Give the location a name.");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("locations")
      .insert({
        club_id: clubId,
        name,
        address: savePrompt.address.trim() || null,
        created_by: user?.id ?? null,
      })
      .select("id, name, address")
      .single();
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const loc = data as SavedLocation;
    setLocations((prev) =>
      [...prev, loc].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setSavePrompt(null);
    onChange(formatLocation(loc));
    onLocationIdChange?.(loc.id);
    toast.success("Location saved");
  };

  return (
    <div className={cn("space-y-2", className)}>
      {clubId && (
        <div className="space-y-1.5">
          {loading ? (
            <div className="h-9 w-full rounded-lg bg-muted/40 animate-pulse" />
          ) : locations.length > 0 ? (
            <>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Saved locations
              </div>
              <Select
                value={selected?.id ?? ""}
                onValueChange={(id) => {
                  const loc = locations.find((l) => l.id === id);
                  if (loc) pickSaved(loc);
                }}
              >
                <SelectTrigger className="h-9 rounded-lg">
                  <SelectValue placeholder="Select a saved location...">
                    {selected?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      <span className="flex flex-col items-start">
                        <span>{l.name}</span>
                        {l.address && (
                          <span className="text-xs text-muted-foreground">{l.address}</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 pt-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  or enter a new address
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
            </>
          ) : null}
        </div>
      )}

      <AddressAutocomplete
        id={id}
        value={value}
        onChange={handleTyped}
        onSelect={handleSelected}
        placeholder={placeholder}
      />

      {savePrompt && (
        <div className="rounded-lg border bg-muted/30 p-2.5 space-y-2">
          <div className="text-xs font-medium">Save this location?</div>
          <div className="flex items-center gap-2">
            <Input
              value={savePrompt.name}
              onChange={(e) =>
                setSavePrompt((p) => (p ? { ...p, name: e.target.value } : p))
              }
              placeholder="Location name"
              className="h-8 text-sm"
            />
            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0"
              disabled={saving}
              onClick={saveNewLocation}
            >
              <Check className="h-3.5 w-3.5 mr-1" /> Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 shrink-0"
              onClick={() => setSavePrompt(null)}
            >
              <X className="h-3.5 w-3.5 mr-1" /> Skip
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
