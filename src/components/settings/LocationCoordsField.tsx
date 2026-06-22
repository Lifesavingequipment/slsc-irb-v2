import { useEffect, useRef, useState } from "react";
import { AddressAutocomplete } from "./AddressAutocomplete";
import { LocationMapPreview } from "./LocationMapPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, MapPin, Check, X, Pencil } from "lucide-react";
import { geocodeAddress, isValidLat, isValidLng, type Coords } from "@/lib/geocode";

type Status = "idle" | "searching" | "found" | "error";

type Props = {
  id?: string;
  address: string;
  onAddressChange: (value: string) => void;
  /** Confirmed coordinates for the current address — null means unconfirmed. */
  coords: Coords | null;
  onCoordsChange: (coords: Coords | null) => void;
  placeholder?: string;
};

/**
 * Address field with an explicit geocode-confirm step and a manual lat/lng
 * override. `coords` is only ever non-null once the user has actively
 * confirmed a resolved pin or typed in valid coordinates themselves — there
 * is no silent fallback to guessed coordinates.
 */
export function LocationCoordsField({ id, address, onAddressChange, coords, onCoordsChange, placeholder }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [candidate, setCandidate] = useState<Coords | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualLat, setManualLat] = useState(coords ? String(coords.lat) : "");
  const [manualLng, setManualLng] = useState(coords ? String(coords.lng) : "");
  const [manualError, setManualError] = useState<string | null>(null);

  // Auto-resolve once on mount for legacy/edit rows that have an address but
  // no confirmed coordinates yet, so the confirm prompt appears immediately.
  const autoTried = useRef(false);
  useEffect(() => {
    if (autoTried.current) return;
    autoTried.current = true;
    if (address.trim() && !coords) {
      void runGeocode(address);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runGeocode = async (query: string) => {
    setStatus("searching");
    const result = await geocodeAddress(query);
    if (result) {
      setCandidate(result);
      setStatus("found");
    } else {
      setCandidate(null);
      setStatus("error");
    }
  };

  const handleTextChange = (v: string) => {
    onAddressChange(v);
    setCandidate(null);
    setStatus("idle");
    if (coords) onCoordsChange(null);
  };

  const handleSelect = (v: string, selCoords: Coords) => {
    onAddressChange(v);
    setCandidate(selCoords);
    setStatus("found");
    if (coords) onCoordsChange(null);
  };

  const confirmCandidate = () => {
    if (!candidate) return;
    onCoordsChange(candidate);
    setStatus("idle");
  };

  const rejectCandidate = () => {
    setCandidate(null);
    setStatus("idle");
  };

  const openManual = () => {
    setManualMode(true);
    setManualError(null);
    setManualLat(coords ? String(coords.lat) : "");
    setManualLng(coords ? String(coords.lng) : "");
  };

  const applyManual = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (!isValidLat(lat)) { setManualError("Latitude must be a number between -90 and 90."); return; }
    if (!isValidLng(lng)) { setManualError("Longitude must be a number between -180 and 180."); return; }
    setManualError(null);
    onCoordsChange({ lat, lng });
    setManualMode(false);
    setCandidate(null);
    setStatus("idle");
  };

  const changeCoords = () => {
    onCoordsChange(null);
    setStatus("idle");
    setCandidate(null);
  };

  return (
    <div className="space-y-2">
      {!manualMode && (
        <AddressAutocomplete
          id={id}
          value={address}
          onChange={handleTextChange}
          onSelect={handleSelect}
          placeholder={placeholder}
        />
      )}

      {!manualMode && status === "searching" && (
        <p className="text-xs text-muted-foreground">Looking up that address…</p>
      )}

      {!manualMode && status === "error" && (
        <p className="text-xs text-destructive">
          Couldn't find that address — check the spelling or enter coordinates manually below.
        </p>
      )}

      {!manualMode && address.trim() && !coords && (status === "idle" || status === "error") && (
        <Button type="button" size="sm" variant="outline" onClick={() => runGeocode(address)}>
          <Search className="h-3.5 w-3.5 mr-1.5" /> Find on map
        </Button>
      )}

      {!manualMode && status === "found" && candidate && (
        <div className="rounded-lg border p-3 space-y-2">
          <LocationMapPreview coords={candidate} />
          <p className="text-xs text-muted-foreground">Pinned at the resolved address — is this the right spot?</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={confirmCandidate}>
              <Check className="h-3.5 w-3.5 mr-1" /> Looks right
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={rejectCandidate}>
              <X className="h-3.5 w-3.5 mr-1" /> Not quite
            </Button>
          </div>
        </div>
      )}

      {!manualMode && coords && status === "idle" && (
        <div className="rounded-lg border p-3 space-y-2">
          <LocationMapPreview coords={coords} className="h-28" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3 text-primary" /> {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
            </span>
            <Button type="button" size="sm" variant="ghost" onClick={changeCoords}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Change
            </Button>
          </div>
        </div>
      )}

      {!manualMode && (
        <button
          type="button"
          onClick={openManual}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Enter coordinates manually
        </button>
      )}

      {manualMode && (
        <div className="rounded-lg border p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor={`${id ?? "loc"}-lat`} className="text-xs">Latitude</Label>
              <Input
                id={`${id ?? "loc"}-lat`}
                inputMode="decimal"
                placeholder="-28.0167"
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${id ?? "loc"}-lng`} className="text-xs">Longitude</Label>
              <Input
                id={`${id ?? "loc"}-lng`}
                inputMode="decimal"
                placeholder="153.4"
                value={manualLng}
                onChange={(e) => setManualLng(e.target.value)}
              />
            </div>
          </div>
          {manualError && <p className="text-xs text-destructive">{manualError}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={applyManual}>
              <Check className="h-3.5 w-3.5 mr-1" /> Use these coordinates
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setManualMode(false)}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
