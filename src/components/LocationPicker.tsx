import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete } from "@/components/settings/AddressAutocomplete";
import { Check, ChevronDown, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Matches the dropdown's max-h-48.
const DROPDOWN_MAX_HEIGHT = 192;

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

  // Saved-locations dropdown: portaled + positioned manually so it can flip
  // upward and stay within the viewport instead of clipping on mobile.
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!dropdownOpen) return;
    const reposition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUpward = spaceBelow < DROPDOWN_MAX_HEIGHT && spaceAbove > spaceBelow;
      setDropdownStyle({
        position: "fixed",
        left: rect.left,
        width: rect.width,
        maxHeight: DROPDOWN_MAX_HEIGHT,
        ...(openUpward ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      });
    };
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [dropdownOpen]);

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
    setDropdownOpen(false);
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
    const exists = locations.some((l) => l.address === address || formatLocation(l) === address);
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
    setLocations((prev) => [...prev, loc].sort((a, b) => a.name.localeCompare(b.name)));
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
              <button
                type="button"
                ref={triggerRef}
                onClick={() => setDropdownOpen((o) => !o)}
                className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <span className={cn("truncate", !selected && "text-muted-foreground")}>
                  {selected?.name ?? "Select a saved location..."}
                </span>
                <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
              </button>

              {dropdownOpen &&
                createPortal(
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                    <div
                      style={dropdownStyle}
                      className="z-50 max-h-48 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md p-1"
                    >
                      {locations.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => pickSaved(l)}
                          className="flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                        >
                          <span>{l.name}</span>
                          {l.address && (
                            <span className="text-xs text-muted-foreground">{l.address}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </>,
                  document.body,
                )}
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
              onChange={(e) => setSavePrompt((p) => (p ? { ...p, name: e.target.value } : p))}
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
