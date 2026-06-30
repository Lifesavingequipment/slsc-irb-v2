import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Check, Search, X, ChevronDown, ChevronUp } from "lucide-react";
import { showToast } from "@/lib/toast";

export type AttStatus = "present" | "late" | "excused" | "absent" | "injured";

export type Attendance = {
  id: string;
  user_id: string;
  status: AttStatus;
  note: string | null;
};

type Member = {
  id: string;
  auth_user_id: string | null;
  user_id: string;
  display_name: string;
  driver_flag: boolean;
  crew_flag: boolean;
};

type FilterKey = "all" | "present" | "absent" | "late" | "needs_marking";

const ATT_CONFIG: Record<AttStatus, { label: string; chip: string; dot: string; ring: string }> = {
  present: { label: "Present", chip: "bg-green-100 text-green-800 border-green-200", dot: "bg-green-500", ring: "ring-green-500" },
  late: { label: "Late", chip: "bg-amber-100 text-amber-800 border-amber-200", dot: "bg-amber-500", ring: "ring-amber-500" },
  excused: { label: "Excused", chip: "bg-blue-100 text-blue-800 border-blue-200", dot: "bg-blue-500", ring: "ring-blue-500" },
  absent: { label: "Absent", chip: "bg-red-100 text-red-800 border-red-200", dot: "bg-red-500", ring: "ring-red-500" },
  injured: { label: "Injured", chip: "bg-purple-100 text-purple-800 border-purple-200", dot: "bg-purple-500", ring: "ring-purple-500" },
};

const STATUS_ORDER: AttStatus[] = ["present", "late", "excused", "absent", "injured"];

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "present", label: "Present" },
  { key: "absent", label: "Absent" },
  { key: "late", label: "Late" },
  { key: "needs_marking", label: "Needs marking" },
];

/* ---------------------------- Mini success tick ---------------------------- */

function SuccessTick({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-green-500 text-white animate-in zoom-in-50 fade-in duration-200">
      <Check className="h-2.5 w-2.5" strokeWidth={3} />
    </span>
  );
}

/* ------------------------------ Note input --------------------------------- */

function NoteField({
  initial,
  onSave,
}: {
  initial: string | null;
  onSave: (note: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initial ?? "");
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setValue(initial ?? ""), [initial]);

  const scheduleSave = (next: string) => {
    setValue(next);
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (next.trim() === (initial ?? "").trim()) return;
      await onSave(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }, 600);
  };

  return (
    <div className="relative">
      <Input
        className="h-9 text-xs pr-7"
        placeholder="Note (autosaves)"
        value={value}
        onChange={(e) => scheduleSave(e.target.value)}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2">
        <SuccessTick show={saved} />
      </div>
    </div>
  );
}

/* ------------------------------ Status chip row ----------------------------- */

function StatusButtons({
  current,
  onPick,
  size = "default",
}: {
  current: AttStatus | null;
  onPick: (s: AttStatus) => void;
  size?: "default" | "compact";
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {STATUS_ORDER.map((s) => {
        const cfg = ATT_CONFIG[s];
        const active = current === s;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className={`flex flex-col items-center justify-center gap-1 rounded-lg border text-[10px] font-semibold transition-all min-h-[52px] ${
              active
                ? `${cfg.chip} ring-2 ${cfg.ring} ring-offset-1`
                : "border-border bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${active ? cfg.dot : "bg-muted-foreground/30"}`} />
            {cfg.label}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------- Main ------------------------------------- */

export function AttendancePanel({
  sessionId, attendance, setAttendance, members, rsvpIds, canManage, currentUserId, clubId, onChange, nameOf,
}: {
  sessionId: string;
  attendance: Attendance[];
  setAttendance: React.Dispatch<React.SetStateAction<Attendance[]>>;
  members: Member[];
  rsvpIds: string[];
  canManage: boolean;
  currentUserId: string | null;
  clubId: string | null;
  onChange: () => void;
  nameOf: (id: string) => string;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [recentlySaved, setRecentlySaved] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(true);

  // Visible: anyone who RSVP'd (any status) + anyone already marked
  const targetIds = new Set<string>(rsvpIds);
  attendance.forEach((a) => targetIds.add(a.user_id));
  const targetList = members.filter((m) => targetIds.has(m.user_id));
  const allList = canManage && targetList.length === 0 ? members : targetList;

  const byName = (a: Member, b: Member) => nameOf(a.user_id).localeCompare(nameOf(b.user_id));
  const sortedList = useMemo(() => [...allList].sort(byName), [allList, attendance.length]);

  const statusFor = (userId: string): AttStatus | null =>
    attendance.find((a) => a.user_id === userId)?.status ?? null;

  // Search + filter
  const visibleList = sortedList.filter((m) => {
    if (search && !nameOf(m.user_id).toLowerCase().includes(search.toLowerCase())) return false;
    const st = statusFor(m.user_id);
    if (filter === "all") return true;
    if (filter === "needs_marking") return st === null;
    return st === filter;
  });

  const flashSaved = (userId: string) => {
    setRecentlySaved((prev) => new Set(prev).add(userId));
    setTimeout(() => {
      setRecentlySaved((prev) => { const n = new Set(prev); n.delete(userId); return n; });
    }, 1200);
  };

  const mark = async (userId: string, status: AttStatus) => {
    if (!clubId) return;
    const existing = attendance.find((a) => a.user_id === userId);
    if (existing) {
      const prevStatus = existing.status;
      // Optimistic — instant UI update, never resets selection or search.
      setAttendance((prev) => prev.map((a) => (a.id === existing.id ? { ...a, status } : a)));
      flashSaved(userId);
      const { error } = await supabase.from("session_attendance")
        .update({ status, marked_by: currentUserId, marked_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) {
        setAttendance((prev) => prev.map((a) => (a.id === existing.id ? { ...a, status: prevStatus } : a)));
        showToast.error(error.message);
        return;
      }
      showToast.withUndo(`Attendance — ${ATT_CONFIG[status].label}`, async () => {
        await supabase.from("session_attendance").update({ status: prevStatus }).eq("id", existing.id);
        onChange();
      });
    } else {
      const tempId = `temp-${userId}`;
      setAttendance((prev) => [...prev, { id: tempId, user_id: userId, status, note: null }]);
      flashSaved(userId);
      const { data, error } = await supabase.from("session_attendance").upsert(
        { session_id: sessionId, user_id: userId, status, marked_by: currentUserId },
        { onConflict: "session_id,user_id" },
      ).select("id").maybeSingle();
      if (error) {
        setAttendance((prev) => prev.filter((a) => a.id !== tempId));
        showToast.error(error.message);
        return;
      }
      if (data) {
        setAttendance((prev) => prev.map((a) => (a.id === tempId ? { ...a, id: data.id } : a)));
      }
    }
  };

  const saveNote = async (userId: string, note: string) => {
    const trimmed = note.trim() || null;
    const existing = attendance.find((a) => a.user_id === userId);
    if (!existing) {
      const { error } = await supabase.from("session_attendance").upsert(
        { session_id: sessionId, user_id: userId, status: "present" as AttStatus, marked_by: currentUserId, note: trimmed },
        { onConflict: "session_id,user_id" },
      );
      if (error) { showToast.error(error.message); return; }
      onChange();
    } else {
      setAttendance((prev) => prev.map((a) => (a.id === existing.id ? { ...a, note: trimmed } : a)));
      const { error } = await supabase.from("session_attendance")
        .update({ note: trimmed }).eq("id", existing.id);
      if (error) { showToast.error(error.message); return; }
    }
  };

  // ── Multi-select ──────────────────────────────────────────────────────────
  const toggleSelect = (userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected(new Set(visibleList.map((m) => m.user_id)));
  };

  const clearSelection = () => setSelected(new Set());

  const bulkMark = async (status: AttStatus) => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    for (const userId of ids) {
      await mark(userId, status);
    }
    showToast.success(`${ids.length} member${ids.length === 1 ? "" : "s"} marked — ${ATT_CONFIG[status].label}`);
    clearSelection();
  };

  // ── Live totals ──────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c: Record<AttStatus, number> = { present: 0, late: 0, excused: 0, absent: 0, injured: 0 };
    sortedList.forEach((m) => {
      const s = statusFor(m.user_id);
      if (s) c[s]++;
    });
    return c;
  }, [sortedList, attendance]);

  const markedCount = sortedList.filter((m) => statusFor(m.user_id) !== null).length;
  const totalCount = sortedList.length;
  const pct = totalCount === 0 ? 0 : Math.round((markedCount / totalCount) * 100);

  /* ----------------------------- Non-coach view ----------------------------- */

  if (!canManage) {
    const me = attendance.find((a) => a.user_id === currentUserId);
    return (
      <Card className="p-4">
        <div className="text-sm font-semibold mb-2">Your attendance</div>
        {me ? (
          <>
            <Badge variant="outline" className={ATT_CONFIG[me.status].chip}>
              {ATT_CONFIG[me.status].label}
            </Badge>
            {me.note && <p className="mt-2 text-xs text-muted-foreground">{me.note}</p>}
          </>
        ) : (
          <div className="text-xs text-muted-foreground">Not yet marked by a coach.</div>
        )}
      </Card>
    );
  }

  /* -------------------------------- Coach view ------------------------------ */

  return (
    <div className="space-y-3">
      {/* Live totals */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold">Attendance</div>
          <div className="text-xs text-muted-foreground">{markedCount}/{totalCount} marked</div>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {STATUS_ORDER.map((s) => (
            <div key={s} className="flex flex-col items-center gap-0.5">
              <span className={`text-base font-bold ${
                s === "present" ? "text-green-600" :
                s === "late" ? "text-amber-600" :
                s === "excused" ? "text-blue-600" :
                s === "absent" ? "text-red-600" : "text-purple-600"
              }`}>
                {counts[s]}
              </span>
              <span className="text-[10px] text-muted-foreground">{ATT_CONFIG[s].label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Search + filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search members…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 pl-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                filter === f.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {f.label}
              {f.key === "needs_marking" && totalCount - markedCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px]">
                  {totalCount - markedCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <Card className="p-3 border-primary/40 bg-primary/5 sticky top-2 z-10 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold">{selected.size} selected</span>
            <button type="button" onClick={clearSelection} className="text-xs text-muted-foreground underline">
              Clear
            </button>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {STATUS_ORDER.map((s) => (
              <Button
                key={s}
                size="sm"
                variant="outline"
                className={`h-9 text-[10px] px-1 ${ATT_CONFIG[s].chip}`}
                onClick={() => bulkMark(s)}
              >
                {ATT_CONFIG[s].label}
              </Button>
            ))}
          </div>
        </Card>
      )}

      {visibleList.length > 1 && (
        <button
          type="button"
          onClick={selected.size === visibleList.length ? clearSelection : selectAllVisible}
          className="text-xs text-primary font-medium px-1"
        >
          {selected.size === visibleList.length ? "Deselect all" : `Select all (${visibleList.length})`}
        </button>
      )}

      {/* Member list */}
      {visibleList.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground text-center">
          {search ? "No members match your search." : "No members to mark yet."}
        </Card>
      ) : (
        <div className="space-y-2">
          {visibleList.map((m) => {
            const cur = statusFor(m.user_id);
            const row = attendance.find((a) => a.user_id === m.user_id);
            const isSelected = selected.has(m.user_id);
            return (
              <Card key={m.user_id} className={`p-3 transition-colors ${isSelected ? "border-primary/50 bg-primary/5" : ""}`}>
                <div className="flex items-start gap-2.5 mb-2.5">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelect(m.user_id)}
                    className="mt-0.5 h-5 w-5"
                  />
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{nameOf(m.user_id)}</span>
                    {recentlySaved.has(m.user_id) && <SuccessTick show />}
                  </div>
                  {cur && (
                    <Badge variant="outline" className={`shrink-0 text-[10px] ${ATT_CONFIG[cur].chip}`}>
                      {ATT_CONFIG[cur].label}
                    </Badge>
                  )}
                </div>
                <StatusButtons current={cur} onPick={(s) => mark(m.user_id, s)} />
                <div className="mt-2">
                  <NoteField initial={row?.note ?? null} onSave={(note) => saveNote(m.user_id, note)} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
