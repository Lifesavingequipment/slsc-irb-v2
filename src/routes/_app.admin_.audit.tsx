import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, History, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useClub } from "@/lib/club-context";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/admin_/audit")({
  head: () => ({ meta: [{ title: "Audit log — IRB Coaching" }] }),
  component: AuditPage,
});

type Entry = {
  id: string;
  actor_user_id: string;
  action: string;
  club_id: string | null;
  target_user_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

type Club = { id: string; name: string };
type Profile = { id: string; full_name: string | null };

const ACTION_LABELS: Record<string, string> = {
  session_create: "Session created",
  session_update: "Session updated",
  session_delete: "Session deleted",
  rsvp_create: "RSVP set",
  rsvp_update: "RSVP changed",
  rsvp_delete: "RSVP removed",
  equipment_insert: "Equipment added",
  equipment_update: "Equipment updated",
  equipment_delete: "Equipment deleted",
  equipment_category_insert: "Category added",
  equipment_category_update: "Category updated",
  equipment_category_delete: "Category deleted",
  equipment_list_insert: "Packing list added",
  equipment_list_update: "Packing list updated",
  equipment_list_delete: "Packing list deleted",
  equipment_list_item_insert: "List item added",
  equipment_list_item_update: "List item updated",
  equipment_list_item_delete: "List item removed",
  assign_role: "Role granted",
  revoke_role: "Role revoked",
  update_coach_permissions: "Coach permissions updated",
};

function AuditPage() {
  const { user } = useAuth();
  const { isPlatformOwner, loading } = useClub();

  if (loading) {
    return <AppShell><div className="py-12 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;
  }
  if (!user || !isPlatformOwner) return <Navigate to="/dashboard" replace />;
  return <AuditInner />;
}

function AuditInner() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [clubs, setClubs] = useState<Record<string, Club>>({});
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [clubFilter, setClubFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoadingEntries(true);
      const { data: rows } = await supabase
        .from("audit_log")
        .select("id, actor_user_id, action, club_id, target_user_id, details, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      const list = (rows ?? []) as Entry[];
      setEntries(list);

      const clubIds = Array.from(new Set(list.map((e) => e.club_id).filter(Boolean) as string[]));
      const userIds = Array.from(new Set(
        list.flatMap((e) => [e.actor_user_id, e.target_user_id].filter(Boolean) as string[]),
      ));

      const [clubsRes, profRes] = await Promise.all([
        clubIds.length
          ? supabase.from("clubs").select("id, name").in("id", clubIds)
          : Promise.resolve({ data: [] as Club[] }),
        userIds.length
          ? supabase.from("profiles").select("id, full_name").in("id", userIds)
          : Promise.resolve({ data: [] as Profile[] }),
      ]);
      const cmap: Record<string, Club> = {};
      ((clubsRes.data ?? []) as Club[]).forEach((c) => { cmap[c.id] = c; });
      setClubs(cmap);
      const pmap: Record<string, Profile> = {};
      ((profRes.data ?? []) as Profile[]).forEach((p) => { pmap[p.id] = p; });
      setProfiles(pmap);
      setLoadingEntries(false);
    })();
  }, []);

  const actions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.action))).sort(),
    [entries],
  );

  const clubOptions = useMemo(
    () => Object.values(clubs).sort((a, b) => a.name.localeCompare(b.name)),
    [clubs],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (clubFilter !== "all" && e.club_id !== clubFilter) return false;
      if (actionFilter !== "all" && e.action !== actionFilter) return false;
      if (q) {
        const actor = profiles[e.actor_user_id]?.full_name ?? "";
        const target = e.target_user_id ? profiles[e.target_user_id]?.full_name ?? "" : "";
        const club = e.club_id ? clubs[e.club_id]?.name ?? "" : "";
        const hay = `${actor} ${target} ${club} ${e.action}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, clubFilter, actionFilter, search, profiles, clubs]);

  const describe = (e: Entry) => {
    const actor = profiles[e.actor_user_id]?.full_name || "Someone";
    const target = e.target_user_id ? profiles[e.target_user_id]?.full_name : null;
    const label = ACTION_LABELS[e.action] ?? e.action;
    if (target) return `${actor} → ${label} (${target})`;
    return `${actor} · ${label}`;
  };

  return (
    <AppShell title="Audit log">
      <Link to="/admin" className="inline-flex items-center text-sm text-muted-foreground mb-3">
        <ChevronLeft className="h-4 w-4" /> Platform admin
      </Link>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Recent activity</h2>
          <Badge variant="secondary" className="ml-auto">{filtered.length}</Badge>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actor, target, club or action"
            className="h-9 flex-1"
          />
          <Select value={clubFilter} onValueChange={setClubFilter}>
            <SelectTrigger className="h-9 sm:w-[200px]">
              <Filter className="h-4 w-4 mr-1" /><SelectValue placeholder="All clubs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clubs</SelectItem>
              {clubOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="h-9 sm:w-[200px]"><SelectValue placeholder="All actions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {actions.map((a) => (
                <SelectItem key={a} value={a}>{ACTION_LABELS[a] ?? a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loadingEntries ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No audit entries match.</p>
        ) : (
          <div className="divide-y rounded-md border text-sm">
            {filtered.map((e) => (
              <div key={e.id} className="p-3 space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{describe(e)}</span>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {new Date(e.created_at).toLocaleString()}
                  </span>
                </div>
                {e.club_id && clubs[e.club_id] && (
                  <div className="text-xs text-muted-foreground">{clubs[e.club_id].name}</div>
                )}
                {e.details && Object.keys(e.details).length > 0 && (
                  <pre className="mt-1 text-[11px] bg-muted/40 rounded p-2 overflow-x-auto">
                    {JSON.stringify(e.details, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </AppShell>
  );
}
