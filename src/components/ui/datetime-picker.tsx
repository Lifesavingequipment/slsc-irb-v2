import * as React from "react";
import { format, parse } from "date-fns";
import { CalendarIcon, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Value format matches <input type="datetime-local">: "yyyy-MM-ddTHH:mm".
// Empty string = unset.
export interface DateTimePickerProps {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
  minuteStep?: 15 | 30;
  ariaLabel?: string;
  className?: string;
  invalid?: boolean;
}

function buildTimes(step: 15 | 30): string[] {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += step) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
}

export function DateTimePicker({
  id, value, onChange, required, minuteStep = 15, ariaLabel, className, invalid,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);

  const [datePart, timePart] = React.useMemo(() => {
    if (!value) return ["", ""] as const;
    const [d, t] = value.split("T");
    return [d ?? "", (t ?? "").slice(0, 5)] as const;
  }, [value]);

  // Display string in dd/mm/yyyy for AU locale.
  const [dateText, setDateText] = React.useState<string>(
    datePart ? format(parse(datePart, "yyyy-MM-dd", new Date()), "dd/MM/yyyy") : ""
  );
  React.useEffect(() => {
    setDateText(datePart ? format(parse(datePart, "yyyy-MM-dd", new Date()), "dd/MM/yyyy") : "");
  }, [datePart]);

  const times = React.useMemo(() => buildTimes(minuteStep), [minuteStep]);

  const commit = (nextDate: string, nextTime: string) => {
    if (!nextDate) { onChange(""); return; }
    onChange(`${nextDate}T${nextTime || "09:00"}`);
  };

  const onDatePick = (d: Date | undefined) => {
    if (!d) return;
    const iso = format(d, "yyyy-MM-dd");
    commit(iso, timePart);
    // Defer close to next tick so the click on the date cell can't
    // bubble to controls under the popover after it unmounts.
    setTimeout(() => setOpen(false), 0);
  };

  const onDateText = (txt: string) => {
    setDateText(txt);
    // dd/mm/yyyy parse
    const parsed = parse(txt, "dd/MM/yyyy", new Date());
    if (!isNaN(parsed.getTime()) && txt.length === 10) {
      commit(format(parsed, "yyyy-MM-dd"), timePart);
    }
  };

  const selectedDate = datePart
    ? parse(datePart, "yyyy-MM-dd", new Date())
    : undefined;

  return (
    <div className={cn("flex gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            id={id}
            aria-label={ariaLabel ?? "Pick date"}
            aria-invalid={invalid || undefined}
            className={cn(
              "flex-1 justify-start text-left font-normal h-9 px-3",
              !datePart && "text-muted-foreground",
              invalid && "border-destructive",
            )}
          >
            <CalendarIcon className="h-4 w-4 mr-2 shrink-0" />
            <span className="truncate">{dateText || "dd/mm/yyyy"}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0"
          align="start"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div className="p-2 border-b">
            <Input
              value={dateText}
              onChange={(e) => onDateText(e.target.value)}
              placeholder="dd/mm/yyyy"
              inputMode="numeric"
              aria-label="Date (dd/mm/yyyy)"
              className="h-8"
            />
          </div>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={onDatePick}
            weekStartsOn={1}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>

      <Select
        value={timePart}
        onValueChange={(t) => commit(datePart, t)}
      >
        <SelectTrigger
          aria-label="Time (24-hour)"
          className="w-[110px] h-9 focus:ring-2 focus:ring-ring data-[state=open]:ring-2 data-[state=open]:ring-ring"
        >
          <Clock className="h-4 w-4 mr-1 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="--:--" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {times.map((t) => (
            <SelectItem key={t} value={t} className="font-mono">{t}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Hidden input keeps native form `required` semantics. */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden
          required
          value={value}
          onChange={() => { /* controlled by picker */ }}
          className="sr-only"
        />
      )}
    </div>
  );
}
