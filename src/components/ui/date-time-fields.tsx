import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Value format: "yyyy-MM-ddTHH:mm" (matches <input type="datetime-local">).
// Uses two native HTML inputs — most reliable on mobile, click-to-pick,
// manual entry allowed, 24-hour format, no popover/timezone issues.
export interface DateTimeFieldsProps {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
  invalid?: boolean;
  className?: string;
  ariaLabel?: string;
}

function splitValue(v: string): [string, string] {
  if (!v) return ["", ""];
  const [d, t] = v.split("T");
  return [d ?? "", (t ?? "").slice(0, 5)];
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

// 24h "HH:mm" -> { h12, minute, meridiem } for display in the three controls below.
function to12Hour(timePart: string): { h12: number; minute: string; meridiem: "AM" | "PM" } {
  const [hStr, mStr] = (timePart || "09:00").split(":");
  const h24 = parseInt(hStr, 10) || 0;
  const meridiem: "AM" | "PM" = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { h12, minute: mStr ?? "00", meridiem };
}

// (h12, minute, meridiem) -> 24h "HH:mm", handling the 12 -> 00 edge.
function to24Hour(h12: number, minute: string, meridiem: "AM" | "PM"): string {
  let h24 = h12 % 12;
  if (meridiem === "PM") h24 += 12;
  return `${String(h24).padStart(2, "0")}:${minute}`;
}

export function DateTimeFields({
  id, value, onChange, required, invalid, className,
}: DateTimeFieldsProps) {
  const [datePart, timePart] = splitValue(value);
  const { h12, minute, meridiem } = to12Hour(timePart);
  const minuteOptions = MINUTES.includes(minute) ? MINUTES : [...MINUTES, minute].sort();

  const commit = (d: string, t: string) => {
    if (!d) { onChange(""); return; }
    onChange(`${d}T${t || "09:00"}`);
  };

  const commitTime = (next: { h12?: number; minute?: string; meridiem?: "AM" | "PM" }) => {
    commit(
      datePart,
      to24Hour(next.h12 ?? h12, next.minute ?? minute, next.meridiem ?? meridiem),
    );
  };

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <Input
        id={id}
        type="date"
        value={datePart}
        required={required}
        aria-invalid={invalid || undefined}
        onChange={(e) => commit(e.target.value, timePart)}
        className={cn("flex-1 h-11", invalid && "border-destructive")}
      />
      <select
        aria-label="Hour"
        value={h12}
        onChange={(e) => commitTime({ h12: parseInt(e.target.value, 10) })}
        className={cn(
          "h-11 rounded-md border border-input bg-background px-2 text-sm",
          invalid && "border-destructive",
        )}
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <select
        aria-label="Minute"
        value={minute}
        onChange={(e) => commitTime({ minute: e.target.value })}
        className={cn(
          "h-11 rounded-md border border-input bg-background px-2 text-sm",
          invalid && "border-destructive",
        )}
      >
        {minuteOptions.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <div className="flex h-11 overflow-hidden rounded-md border border-input">
        <button
          type="button"
          aria-pressed={meridiem === "AM"}
          onClick={() => commitTime({ meridiem: "AM" })}
          className={cn(
            "h-full px-3 text-sm font-medium transition-colors",
            meridiem === "AM"
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground",
          )}
        >
          AM
        </button>
        <button
          type="button"
          aria-pressed={meridiem === "PM"}
          onClick={() => commitTime({ meridiem: "PM" })}
          className={cn(
            "h-full px-3 text-sm font-medium transition-colors border-l border-input",
            meridiem === "PM"
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground",
          )}
        >
          PM
        </button>
      </div>
    </div>
  );
}
