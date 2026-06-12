import { useMemo, useState } from "react";
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format,
  isSameDay, isSameMonth, startOfMonth, startOfWeek,
} from "date-fns";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Row = { id: string; title: string; starts_at: string; location: string | null };

interface Props { rows: Row[] }

export function SessionsCalendar({ rows }: Props) {
  const [cursor, setCursor] = useState<Date>(new Date());
  const [selected, setSelected] = useState<Date>(new Date());

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const byDay = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const k = format(new Date(r.starts_at), "yyyy-MM-dd");
      const arr = m.get(k) ?? [];
      arr.push(r);
      m.set(k, arr);
    }
    return m;
  }, [rows]);

  const selectedRows = byDay.get(format(selected, "yyyy-MM-dd")) ?? [];

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="flex items-center justify-between mb-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCursor((d) => addMonths(d, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-semibold">{format(cursor, "MMMM yyyy")}</div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCursor((d) => addMonths(d, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-7 text-[10px] text-muted-foreground mb-1">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="text-center py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const count = (byDay.get(key) ?? []).length;
            const inMonth = isSameMonth(d, cursor);
            const isSelected = isSameDay(d, selected);
            const isToday = isSameDay(d, new Date());
            return (
              <button
                key={key}
                onClick={() => setSelected(d)}
                className={`aspect-square rounded-md text-xs flex flex-col items-center justify-center gap-0.5 border transition-colors ${
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary"
                    : isToday
                      ? "border-primary/50"
                      : "border-transparent hover:bg-muted"
                } ${inMonth ? "" : "opacity-40"}`}
              >
                <span>{format(d, "d")}</span>
                {count > 0 && (
                  <span className={`h-1 w-1 rounded-full ${isSelected ? "bg-primary-foreground" : "bg-primary"}`} />
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="space-y-2">
        <div className="text-sm font-medium px-1">
          {format(selected, "EEE d MMM")}
          <span className="text-muted-foreground ml-2">
            {selectedRows.length === 0 ? "No sessions" : `${selectedRows.length} session${selectedRows.length === 1 ? "" : "s"}`}
          </span>
        </div>
        {selectedRows.map((s) => (
          <Link key={s.id} to="/sessions/$sessionId" params={{ sessionId: s.id }}>
            <Card className="p-3 hover:border-accent transition-colors">
              <div className="flex items-center gap-2 mb-0.5">
                <Badge variant="secondary" className="text-[10px] uppercase">
                  {format(new Date(s.starts_at), "h:mma")}
                </Badge>
              </div>
              <div className="font-semibold text-sm">{s.title}</div>
              {s.location && <div className="text-xs text-muted-foreground">{s.location}</div>}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
