import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Search, X, ChevronDown, ChevronUp } from "lucide-react";
import { showToast } from "@/lib/toast";

export type RsvpStatus = "going" | "maybe" | "not_going";

export type Rsvp = {
  id: string;
  user_id: string;
  member_id: string | null;
  status: RsvpStatus;
  profile: { display_name: string } | null;
};

type Member = {
  id: string;
  auth_user_id: string | null;
  user_id: string;
  display_name: string;
  driver_flag: boolean;
  crew_flag: boolean;
};

const RSVP_CONFIG: Record<RsvpStatus, { label: string; chip: string; dot: string }> = {
  going: { label: "Going", chip: "bg-green-100 text-green-800 border-green-200", dot: "bg-green-500" },
  maybe: { label: "Maybe", chip: "bg-amber-100 text-amber-800 border-amber-200", dot: "bg-amber-500" },
  not_going: { label: "Can't go", chip: "bg-gray-100 text-gray-700 border-gray-200", dot: "bg-gray-400" },
};

const NO_RESPONSE_CHIP = "bg-slate-100 text-slate-600 border-slate-200";

type GroupKey = RsvpStatus | "no_response";

const GROUP_ORDER: { key: GroupKey; label: string }[] = [
  { key: "going", label: "Going" },
  { key: "maybe", label: "Maybe" },
  { key: "not_going", label: "Can't go" },
  { key: "no_response", label: "No response" },
];

export function RsvpManagerPanel({
  sessionId,
  rsvps,
  setRsvps,
  members,
  canManage,
  nameOf,
  onChange,
}: {
  sessionId: string;
  rsvps: Rsvp[];
  setRsvps: React.Dispatch<React.SetStateAction<Rsvp[]>>;
  members: Member[];
  canManage: boolean;
  nameOf: (id: string) => string;
  onChange: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<GroupKey>>(new Set());

  const byName = (a: { user_id: string }, b: { user_id: string }) =>
    nameOf(a.user_id).localeCompare(nameOf(b.user_id));

  const respondedIds = new Set(rsvps.map((r) => r.user_id));
  const noResponseMembers = members.filter((m) => !respondedIds.has(m.user_id));

  const groups: Record<GroupKey, { user_id: string }[]> = {
    going: rsvps.filter((r) => r.status === "going").sort(byName),
    maybe: rsvps.filter((r) => r.status === "maybe").sort(byName),
    not_going: rsvps.filter((r) => r.status === "not_going").sort(byName),
    no_response: [...noResponseMembers].sort(byName),
  };

  // Filter every group by search; search state lives in this component and is
  // never cleared by status updates, so it always persists across actions.
  const filteredGroups: Record<GroupKey, { user_id: string }[]> = useMemo(() => {
    if (!search) return groups;
    const q = search.toLowerCase();
    return {
      going: groups.going.filter((r) => nameOf(r.user_id).toLowerCase().includes(q)),
      maybe: groups.maybe.filter((r) => nameOf(r.user_id).toLowerCase().includes(q)),
      not_going: groups.not_going.filter((r) => nameOf(r.user_id).toLowerCase().includes(q)),
      no_response: groups.no_response.filter((m) => nameOf(m.user_id).toLowerCase().includes(q)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, rsvps, members]);

  const totalMembers = members.length;
  const respondedCount = respondedIds.size;
  const pct = totalMembers === 0 ? 0 : Math.round((respondedCount / totalMembers) * 100);

  const toggleSelect = (userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const toggleCollapsed = (key: GroupKey) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const setStatusFor = async (userId: string, status: RsvpStatus) => {
    const existing = rsvps.find((r) => r.user_id === userId);
    const prevStatus = existing?.status ?? null;
    // Optimistic update — never resets search or selection.
    if (existing) {
      setRsvps((cur) => cur.map((r) => (r.user_id === userId ? { ...r, status } : r)));
    } else {
      setRsvps((cur) => [
        ...cur,
        { id: `temp-${userId}`, user_id: userId, member_id: null, status, profile: null },
      ]);
    }
    const { data, error } = await supabase.from("session_rsvps").upsert(
      { session_id: sessionId, user_id: userId, status },
      { onConflict: "session_id,user_id" },
    ).select("id, user_id, status").maybeSingle();
    if (error) {
      if (prevStatus) {
        setRsvps((cur) => cur.map((r) => (r.user_id === userId ? { ...r, status: prevStatus } : r)));
      } else {
        setRsvps((cur) => cur.filter((r) => r.user_id !== userId));
      }
      showToast.error(error.message);
      return;
    }
    if (data) {
      setRsvps((cur) => cur.map((r) => (r.user_id === userId ? { ...r, id: data.id } : r)));
    }
  };

  const bulkSetStatus = async (status: RsvpStatus) => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    for (const userId of ids) {
      await setStatusFor(userId, status);
    }
    showToast.success(`${ids.length} member${ids.length === 1 ? "" : "s"} updated — ${RSVP_CONFIG[status].label}`);
    clearSelection();
  };

  return (
    <div className="space-y-3">
      {/* RSVP Progress */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-semibold">RSVP Progress</span>
          <span className="text-sm font-bold">{pct}%</span>
        </div>
        <Progress value={pct} className="h-2 mb-1.5" />
        <div className="text-xs text-muted-foreground">
          {respondedCount} / {totalMembers} responded
        </div>
      </Card>

      {/* Search */}
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

      {/* Bulk action bar */}
      {canManage && selected.size > 0 && (
        <Card className="p-3 border-primary/40 bg-primary/5 sticky top-2 z-10 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold">{selected.size} selected</span>
            <button type="button" onClick={clearSelection} className="text-xs text-muted-foreground underline">
              Clear
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(["going", "maybe", "not_going"] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant="outline"
                className={`h-9 text-xs ${RSVP_CONFIG[s].chip}`}
                onClick={() => bulkSetStatus(s)}
              >
                {RSVP_CONFIG[s].label}
              </Button>
            ))}
          </div>
        </Card>
      )}

      {/* Grouped lists */}
      {GROUP_ORDER.map(({ key, label }) => {
        const rows = filteredGroups[key];
        const isCollapsed = collapsed.has(key);
        const dotClass = key === "no_response" ? "bg-slate-400" : RSVP_CONFIG[key as RsvpStatus].dot;
        return (
          <Card key={key} className="overflow-hidden">
            <button
              type="button"
              onClick={() => toggleCollapsed(key)}
              className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
                <span className="text-sm font-semibold">{label}</span>
                <Badge variant="secondary" className="text-[10px] h-5">{rows.length}</Badge>
              </div>
              {isCollapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
            </button>

            {!isCollapsed && (
              <div className="px-3 pb-3 space-y-1">
                {rows.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-1">
                    {search ? "No matches." : "No one here."}
                  </div>
                ) : (
                  rows.map((r) => {
                    const userId = r.user_id;
                    const isSelected = selected.has(userId);
                    return (
                      <div
                        key={userId}
                        className={`flex items-center gap-2.5 py-2 px-2 rounded-lg transition-colors ${
                          isSelected ? "bg-primary/10" : ""
                        }`}
                      >
                        {canManage && (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(userId)}
                            className="h-5 w-5 shrink-0"
                          />
                        )}
                        <span className="text-sm flex-1 min-w-0 truncate">{nameOf(userId)}</span>
                        <Badge
                          variant="outline"
                          className={`shrink-0 text-[10px] ${key === "no_response" ? NO_RESPONSE_CHIP : RSVP_CONFIG[key as RsvpStatus].chip}`}
                        >
                          {key === "no_response" ? "No response" : RSVP_CONFIG[key as RsvpStatus].label}
                        </Badge>
                        {canManage && key !== "no_response" && (
                          <QuickReassign current={key as RsvpStatus} onChange={(s) => setStatusFor(userId, s)} />
                        )}
                        {canManage && key === "no_response" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] px-2"
                            onClick={() => setStatusFor(userId, "going")}
                          >
                            Mark going
                          </Button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function QuickReassign({ current, onChange }: { current: RsvpStatus; onChange: (s: RsvpStatus) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-7 px-2 rounded-md border text-[10px] text-muted-foreground hover:bg-muted"
      >
        Move
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 bg-popover border rounded-lg shadow-lg p-1 w-28">
            {(["going", "maybe", "not_going"] as const)
              .filter((s) => s !== current)
              .map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { onChange(s); setOpen(false); }}
                  className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted"
                >
                  {RSVP_CONFIG[s].label}
                </button>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
