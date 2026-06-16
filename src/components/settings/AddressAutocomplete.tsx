import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

type NominatimResult = {
  place_id: number;
  display_name: string;
};

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

/**
 * Address field with type-ahead suggestions from the free OpenStreetMap
 * Nominatim API (no key required). Falls back to a plain text input if the
 * API is unavailable — the user can always type an address manually.
 */
export function AddressAutocomplete({ id, value, onChange, placeholder, className }: Props) {
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  // When the value change came from picking a suggestion, skip the next fetch.
  const skipFetch = useRef(false);

  // Debounced lookup (300ms) once the query is 3+ chars.
  useEffect(() => {
    if (skipFetch.current) {
      skipFetch.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            q,
          )}&format=json&addressdetails=1&limit=5&countrycodes=au,nz`,
          {
            signal: controller.signal,
            headers: { "User-Agent": "slsc-irb-v2 (surf club app)" },
          },
        );
        if (!res.ok) throw new Error(`Nominatim ${res.status}`);
        const data = (await res.json()) as NominatimResult[];
        setSuggestions(data);
        setOpen(data.length > 0);
        setHighlight(-1);
      } catch {
        // Fail gracefully — leave the typed value, no dropdown.
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  // Dismiss on click outside.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const select = (s: NominatimResult) => {
    skipFetch.current = true;
    onChange(s.display_name);
    setOpen(false);
    setSuggestions([]);
    setHighlight(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" && highlight >= 0) {
      e.preventDefault();
      select(suggestions[highlight]);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border bg-white shadow-md"
          role="listbox"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.place_id}
              role="option"
              aria-selected={i === highlight}
              // onMouseDown (not onClick) so it fires before the input blurs.
              onMouseDown={(e) => {
                e.preventDefault();
                select(s);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "flex cursor-pointer items-start gap-2 px-3 py-2 text-sm",
                i === highlight ? "bg-muted" : "hover:bg-muted/60",
              )}
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0">{s.display_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
