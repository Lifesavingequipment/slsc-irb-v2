import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddressAutocomplete } from "@/components/settings/AddressAutocomplete";
import { LocationMapPreview } from "@/components/settings/LocationMapPreview";
import { Check, ChevronDown, X, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isValidLat, isValidLng, type Coords } from "@/lib/geocode";

const DROPDOWN_MAX_HEIGHT = 192;

export type SavedLocation = { id: string; name: string; address: string | null };

export function formatLocation(l: SavedLocation): string {
  return l.address ? `${l.name} — ${l.address}` : l.name;
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  clubId: string | null | undefined;
  placeholder?: string;
  id?: string;
  className?: string;
  onLocationIdChange?: (id: string | null) => void;
  valueId?: string | null;
};

export function LocationPicker({
  value,
  onChange,
  clubId,
  placeholder = "Select a location...",
  id,
  className,
  onLocationIdChange,
  valueId,
}: Props) {
  const { user } = useAuth();
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // "add new" mode: the dropdown was used to choose "Add new location"
  const [addingNew, setAddingNew] = useState(false);

  const [savePrompt, setSavePrompt] = useState<{ address: string; name: string; coords: Coords } | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  const loadedFor = useRef<string | null>(null);

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
    return () => { cancelled = true; };
  }, [clubId]);

  const selected =
    valueId !== undefined
      ? locations.find((l) => l.id === valueId) ?? null
      : locations.find((l) => formatLocation(l) === value) ?? null;

  const pickSaved = (l: SavedLocation) => {
    setAddingNew(false);
    setSavePrompt(null);
    setManualMode(false);
    setDropdownOpen(false);
    onChange(formatLocation(l));
    onLocationIdChange?.(l.id);
  };

  const pickAddNew = () => {
    setDropdownOpen(false);
    setAddingNew(true);
    // Clear any previously selected saved location
    onChange("");
    onLocationIdChange?.(null);
    setSavePrompt(null);
    setManualMode(false);
  };

  const handleTyped = (v: string) => {
    onChange(v);
    onLocationIdChange?.(null);
    if (!v.trim()) {
      setSavePrompt(null);
      setManualMode(false);
    }
  };

  const handleSelected = (address: string, coords: Coords) => {
    onLocationIdChange?.(null);
    const exists = locations.some((l) => l.address === address || formatLocation(l) === address);
    if (clubId && !exists) {
      setSavePrompt({ address, name: address.split(",")[0].trim(), coords });
      setManualMode(false);
      setManualError(null);
    }
  };

  const applyManualCoords = () => {
    if (!savePrompt) return;
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (!isValidLat(lat)) { setManualError("Latitude must be a number between -90 and 90."); return; }
    if (!isValidLng(lng)) { setManualError("Longitude must be a number between -180 and 180."); return; }
    setManualError(null);
    setSavePrompt({ ...savePrompt, coords: { lat, lng } });
    setManualMode(false);
  };

  const saveNewLocation = async () => {
    if (!clubId || !savePrompt) return;
    const name = savePrompt.name.trim();
    if (!name) { toast.error("Give the location a name."); return; }
    setSaving(true);
    const { data, error } = await supabase
      .from("locations")
      .insert({
        club_id: clubId,
        name,
        address: savePrompt.address.trim() || null,
        lat: savePrompt.coords.lat,
        lng: savePrompt.coords.lng,
        created_by: user?.id ?? null,
      })
      .select("id, name, address")
      .single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    const loc = data as SavedLocation;
    setLocations((prev) => [...prev, loc].sort((a, b) => a.name.localeCompare(b.name)));
    setSavePrompt(null);
    setAddingNew(false);
    onChange(formatLocation(loc));
    onLocationIdChange?.(loc.id);
    toast.success("Location saved");
  };

  // Derive the label shown in the closed dropdown trigger
  const triggerLabel = selected
    ? selected.name
    : addingNew
    ? "New address"
    : null;

  if (!clubId) {
    // No club — just show the address autocomplete directly
    return (
      <div className={cn("space-y-2", className)}>
        <AddressAutocomplete id={id} value={value} onChange={handleTyped} onSelect={handleSelected} placeholder={placeholder} />
        {savePrompt && <SavePromptPanel savePrompt={savePrompt} saving={saving} manualMode={manualMode} manualLat={manualLat} manualLng={manualLng} manualError={manualError} onNameChange={(n) => setSavePrompt((p) => p ? { ...p, name: n } : p)} onSave={saveNewLocation} onSkip={() => setSavePrompt(null)} onManualMode={() => { setManualMode(true); setManualLat(String(savePrompt.coords.lat)); setManualLng(String(savePrompt.coords.lng)); }} onManualLatChange={setManualLat} onManualLngChange={setManualLng} onApplyManual={applyManualCoords} onCancelManual={() => setManualMode(false)} />}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {loading ? (
        <div className="h-9 w-full rounded-lg bg-muted/40 animate-pulse" />
      ) : (
        <>
          {/* Single unified dropdown */}
          <button
            type="button"
            ref={triggerRef}
            onClick={() => setDropdownOpen((o) => !o)}
            className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <span className={cn("truncate", !triggerLabel && "text-muted-foreground")}>
              {triggerLabel ?? placeholder}
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
                  {/* Add new location — always first */}
                  <button
                    type="button"
                    onClick={pickAddNew}
                    className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm font-medium hover:bg-accent"
                    style={{ color: "#FF6600" }}
                  >
                    ＋ Add new location
                  </button>

                  {locations.length > 0 && (
                    <div className="my-1 h-px bg-border" />
                  )}

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
        </>
      )}

      {/* New address input — only shown after "Add new location" is chosen */}
      {addingNew && (
        <AddressAutocomplete
          id={id}
          value={selected ? "" : value}
          onChange={handleTyped}
          onSelect={handleSelected}
          placeholder="Type an address or place name"
        />
      )}

      {savePrompt && (
        <SavePromptPanel
          savePrompt={savePrompt}
          saving={saving}
          manualMode={manualMode}
          manualLat={manualLat}
          manualLng={manualLng}
          manualError={manualError}
          onNameChange={(n) => setSavePrompt((p) => p ? { ...p, name: n } : p)}
          onSave={saveNewLocation}
          onSkip={() => setSavePrompt(null)}
          onManualMode={() => { setManualMode(true); setManualLat(String(savePrompt.coords.lat)); setManualLng(String(savePrompt.coords.lng)); }}
          onManualLatChange={setManualLat}
          onManualLngChange={setManualLng}
          onApplyManual={applyManualCoords}
          onCancelManual={() => setManualMode(false)}
        />
      )}
    </div>
  );
}

type SavePromptPanelProps = {
  savePrompt: { address: string; name: string; coords: Coords };
  saving: boolean;
  manualMode: boolean;
  manualLat: string;
  manualLng: string;
  manualError: string | null;
  onNameChange: (n: string) => void;
  onSave: () => void;
  onSkip: () => void;
  onManualMode: () => void;
  onManualLatChange: (v: string) => void;
  onManualLngChange: (v: string) => void;
  onApplyManual: () => void;
  onCancelManual: () => void;
};

function SavePromptPanel({ savePrompt, saving, manualMode, manualLat, manualLng, manualError, onNameChange, onSave, onSkip, onManualMode, onManualLatChange, onManualLngChange, onApplyManual, onCancelManual }: SavePromptPanelProps) {
  return (
    <div className="rounded-lg border bg-muted/30 p-2.5 space-y-2">
      <div className="text-xs font-medium">Save this location?</div>
      <Input
        value={savePrompt.name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="Location name"
        className="h-8 text-sm"
      />
      {!manualMode ? (
        <>
          <LocationMapPreview coords={savePrompt.coords} className="h-28" />
          <p className="text-xs text-muted-foreground">Pinned at the resolved address — is this correct?</p>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" className="h-8 shrink-0" disabled={saving} onClick={onSave}>
              <Check className="h-3.5 w-3.5 mr-1" /> Looks right, save
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 shrink-0" onClick={onSkip}>
              <X className="h-3.5 w-3.5 mr-1" /> Skip
            </Button>
          </div>
          <button
            type="button"
            onClick={onManualMode}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline flex items-center gap-1"
          >
            <Pencil className="h-3 w-3" /> Not quite right — enter coordinates manually
          </button>
        </>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Latitude</Label>
              <Input inputMode="decimal" placeholder="-28.0167" value={manualLat} onChange={(e) => onManualLatChange(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Longitude</Label>
              <Input inputMode="decimal" placeholder="153.4" value={manualLng} onChange={(e) => onManualLngChange(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
          {manualError && <p className="text-xs text-destructive">{manualError}</p>}
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" className="h-8 shrink-0" onClick={onApplyManual}>
              <Check className="h-3.5 w-3.5 mr-1" /> Use these coordinates
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 shrink-0" onClick={onCancelManual}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
