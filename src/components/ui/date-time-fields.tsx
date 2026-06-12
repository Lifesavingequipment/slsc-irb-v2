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

export function DateTimeFields({
  id, value, onChange, required, invalid, className,
}: DateTimeFieldsProps) {
  const [datePart, timePart] = splitValue(value);

  const commit = (d: string, t: string) => {
    if (!d) { onChange(""); return; }
    onChange(`${d}T${t || "09:00"}`);
  };

  return (
    <div className={cn("flex gap-2", className)}>
      <Input
        id={id}
        type="date"
        value={datePart}
        required={required}
        aria-invalid={invalid || undefined}
        onChange={(e) => commit(e.target.value, timePart)}
        className={cn("flex-1 h-11", invalid && "border-destructive")}
      />
      <Input
        type="time"
        step={60}
        value={timePart}
        aria-label="Time (24-hour)"
        aria-invalid={invalid || undefined}
        onChange={(e) => commit(datePart, e.target.value)}
        className={cn("w-[120px] h-11", invalid && "border-destructive")}
      />
    </div>
  );
}
