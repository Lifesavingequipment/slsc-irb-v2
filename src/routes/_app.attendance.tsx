import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { memberFullName } from "@/lib/names";
import { useClub, useCanManage } from "@/lib/club-context";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Search, ChevronRight, TrendingUp } from "lucide-react";
import { Link as RouterLink } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/attendance")({
  head: () => ({ meta: [{ title: "Attendance — IRB Coaching" }] }),
  component: AttendancePage,
});

type Sess = { id: string; starts_at: string; title: string };
type Att = { session_id: string; user_id: string; status: "present" | "absent" | "excused" | "injured" };
type Member = { user_id: string; name: string };

type Range = "30" | "90" | "365" | "all";

function rangeStart(r: Range): string | null {
  if (r === "all") return null;
  const d = new Date();
  d.setDate(d.getDate() - Number(r));
  return d.toISOString();
}

function AttendancePage() {
  const { activeClub } = useClub();
  const canManage = useCanManage();
  const [range, setRange] = useState<Range>("90");
  const [search, setSearch] = useState("");
  const [sessions, setSessions] = useState<Sess[]>([]);
  const [att, setAtt] = useState<Att[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const clubId = activeClub?.club_id;

  const load = useCallback(async () => {
    if (!clubId) return;
    setLoading(true);
    const start = rangeStart(range);
    let sQ = supabase.from("sessions").select("id, starts_at, title")
      .eq("club_id", clubId).lte("starts_at", new Date().toISOString());
    if (start) sQ = sQ.gte("starts_at", start);
    const { data: sRows } = await sQ.order("starts_at", { ascending: false });
    const s = (sRows ?? []) as Sess[];
    setSessions(s);

    const sessionIds = s.map((x) => x.id);
    if (sessionIds.length) {
      const { data: aRows } = await supabase.from("session_attendance")
        .select("session_id, user_id, status").in("session_id", sessionIds);
      setAtt((aRows ?? []) as Att[]);
    } else {
      setAtt([]);
    }

    const { data: memData } = await supabase.from("members")
      .select("id, auth_user_id, first_name, last_name, preferred_name")
      .eq("club_id", clubId)
      .eq("membership_status", "active")
      .order("first_name");
    setMembers((memData ?? []).map((m) => ({
      user_id: m.auth_user_id ?? m.id,
      name: memberFullName(m, "Unnamed"),
    })));
    setLoading(false);
  }, [clubId, range]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const total = sessions.length;
    type Bucket = { present: number; absent: number; excused: number; injured: number; marked: number; last?: { date: string; status: Att["status"] } };
    const map = new Map<string, Bucket>();
    for (const m of members) map.set(m.user_id, { present: 0, absent: 0, excused: 0, injured: 0, marked: 0 });
    // also include users with att rows even if not in current memberships
    for (const a of att) {
      if (!map.has(a.user_id)) map.set(a.user_id, { present: 0, absent: 0, excused: 0, injured: 0, marked: 0 });
    }
    const sessionDate = new Map(sessions.map((s) => [s.id, s.starts_at]));
    // Track latest per user
    const latest = new Map<string, { date: string; status: Att["status"] }>();
    for (const a of att) {
      const b = map.get(a.user_id);
      if (!b) continue;
      b[a.status] += 1;
      b.marked += 1;
      const d = sessionDate.get(a.session_id);
      if (d) {
        const cur = latest.get(a.user_id);
        if (!cur || d > cur.date) latest.set(a.user_id, { date: d, status: a.status });
      }
    }
    for (const [uid, b] of map.entries()) {
      const l = latest.get(uid);
      if (l) b.last = l;
    }

    const summary = {
      total,
      present: att.filter((a) => a.status === "present").length,
      absent: att.filter((a) => a.status === "absent").length,
      excused: att.filter((a) => a.status === "excused").length,
      injured: att.filter((a) => a.status === "injured").length,
      attended: new Set(att.filter((a) => a.status === "present").map((a) => `${a.session_id}:${a.user_id}`)).size,
    };

    const rows = Array.from(map.entries()).map(([uid, b]) => {
      const m = members.find((x) => x.user_id === uid);
      const pct = total > 0 ? Math.round((b.present / total) * 100) : 0;
      return { user_id: uid, name: m?.name ?? "Former member", ...b, pct };
    }).sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));

    return { summary, rows };
  }, [sessions, att, members]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stats.rows;
    return stats.rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [stats.rows, search]);

  if (!activeClub) {
    return <AppShell title="Attendance"><div className="py-12 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;
  }
  if (!canManage) return <Navigate to="/members" replace />;

  const s = stats.summary;
  const pctOverall = s.total > 0 && members.length > 0
    ? Math.round((s.present / (s.total * members.length)) * 100) : 0;

  return (
    <AppShell title="Attendance">
      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold inline-flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-accent" /> Club overview
            </div>
            <Select value={range} onValueChange={(v) => setRange(v as Range)}>
              <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last 12 months</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Sessions" value={String(s.total)} />
            <Stat label="Avg attendance" value={`${pctOverall}%`} />
            <Stat label="Present marks" value={String(s.present)} tone="success" />
            <Stat label="Absent marks" value={String(s.absent)} tone="destructive" />
            <Stat label="Excused" value={String(s.excused)} tone="warning" />
            <Stat label="Injured" value={String(s.injured)} tone="warning" />
          </div>
        </Card>

        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members"
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<TrendingUp className="h-5 w-5" />}
            title="No attendance yet"
            description={s.total === 0
              ? "No past sessions in this range. Try widening the range."
              : "Mark attendance on a session to see stats here."}
          />
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => (
              <RouterLink
                key={r.user_id}
                to="/members/$memberId"
                params={{ memberId: r.user_id }}
                className="block"
              >
                <Card className="p-3 active:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{r.name}</div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                        <Badge variant="outline" className="font-mono">{r.pct}%</Badge>
                        <span><span className="text-success font-semibold">{r.present}</span>P</span>
                        <span><span className="text-destructive font-semibold">{r.absent}</span>A</span>
                        <span><span className="text-warning font-semibold">{r.excused}</span>E</span>
                        <span><span className="text-warning font-semibold">{r.injured}</span>I</span>
                        <span className="opacity-70">· {r.marked}/{s.total} marked</span>
                      </div>
                      {r.last && (
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          Last: {r.last.status} on {new Date(r.last.date).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <div className="h-9 w-12 rounded bg-muted/40 grid place-items-center text-xs font-semibold">
                      {r.pct}%
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </Card>
              </RouterLink>
            ))}
          </div>
        )}

        <div className="text-center pt-2">
          <Link to="/members" className="text-xs text-muted-foreground underline">
            Back to members
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "destructive" | "warning" }) {
  const color = tone === "success" ? "text-success"
    : tone === "destructive" ? "text-destructive"
    : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-lg border bg-muted/20 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}
