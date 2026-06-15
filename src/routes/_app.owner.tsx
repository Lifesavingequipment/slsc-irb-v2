import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIsPlatformOwner } from "@/lib/platform-owner";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Building2, MessageSquare, Users, CalendarDays, Mail, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/owner")({
  head: () => ({ meta: [{ title: "Owner Dashboard — IRB Coaching" }] }),
  component: OwnerPage,
});

function OwnerPage() {
  const isPlatformOwner = useIsPlatformOwner();

  if (isPlatformOwner === null) {
    return (
      <AppShell>
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }

  if (!isPlatformOwner) return <Navigate to="/dashboard" replace />;

  return <OwnerDashboard />;
}

type RoleCount = { club_admin: number; coach: number; member: number; owner: number };

type Club = {
  id: string;
  club_name: string;
  state_region: string | null;
  address: string | null;
  created_at: string;
  member_count: number;
  role_counts: RoleCount;
  session_total: number;
  sessions_this_month: number;
  last_session_at: string | null;
  admin_email: string | null;
};

type FeedbackRow = {
  id: string;
  club_id: string | null;
  submitted_by: string | null;
  category: string;
  message: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  club_name: string | null;
  submitter_name: string | null;
};

type Stats = { clubs: number; members: number; sessions: number; open_feedback: number };

function OwnerDashboard() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [
        { data: clubData },
        { data: fbData },
        { count: clubCount },
        { count: memberCount },
        { count: sessionCount },
        { count: openFeedbackCount },
        { data: memCounts },
        { data: roleCounts },
        { data: sessionData },
        { data: coachList },
      ] = await Promise.all([
        supabase.from("clubs").select("id, club_name, state_region, address, created_at").order("created_at", { ascending: false }),
        supabase.from("feedback").select("id, club_id, submitted_by, category, message, status, admin_notes, created_at").order("created_at", { ascending: false }),
        supabase.from("clubs").select("id", { count: "exact", head: true }),
        supabase.from("club_memberships").select("id", { count: "exact", head: true }).eq("status", "approved"),
        supabase.from("sessions").select("id", { count: "exact", head: true }),
        supabase.from("feedback").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("club_memberships").select("club_id").eq("status", "approved"),
        supabase.from("user_roles").select("club_id, role"),
        supabase.from("sessions").select("club_id, starts_at").order("starts_at", { ascending: false }),
        supabase.rpc("list_platform_coaches"),
      ]);

      // member count map
      const memCountMap: Record<string, number> = {};
      (memCounts ?? []).forEach((m) => { memCountMap[m.club_id] = (memCountMap[m.club_id] ?? 0) + 1; });

      // role count map
      const roleCountMap: Record<string, RoleCount> = {};
      (roleCounts ?? []).forEach((r) => {
        if (!roleCountMap[r.club_id]) roleCountMap[r.club_id] = { club_admin: 0, coach: 0, member: 0, owner: 0 };
        const role = r.role as keyof RoleCount;
        if (role in roleCountMap[r.club_id]) roleCountMap[r.club_id][role]++;
      });

      // session stats map
      const sessionTotalMap: Record<string, number> = {};
      const sessionMonthMap: Record<string, number> = {};
      const lastSessionMap: Record<string, string> = {};
      (sessionData ?? []).forEach((s) => {
        sessionTotalMap[s.club_id] = (sessionTotalMap[s.club_id] ?? 0) + 1;
        if (s.starts_at >= monthStart) sessionMonthMap[s.club_id] = (sessionMonthMap[s.club_id] ?? 0) + 1;
        if (!lastSessionMap[s.club_id]) lastSessionMap[s.club_id] = s.starts_at;
      });

      // admin email map (first admin/owner per club)
      const adminEmailMap: Record<string, string> = {};
      (coachList ?? []).forEach((c) => {
        if ((c.role === "owner" || c.role === "club_admin") && !adminEmailMap[c.club_id] && c.email) {
          adminEmailMap[c.club_id] = c.email;
        }
      });

      setClubs(
        (clubData ?? []).map((c) => ({
          id: c.id,
          club_name: c.club_name,
          state_region: c.state_region,
          address: c.address ?? null,
          created_at: c.created_at,
          member_count: memCountMap[c.id] ?? 0,
          role_counts: roleCountMap[c.id] ?? { club_admin: 0, coach: 0, member: 0, owner: 0 },
          session_total: sessionTotalMap[c.id] ?? 0,
          sessions_this_month: sessionMonthMap[c.id] ?? 0,
          last_session_at: lastSessionMap[c.id] ?? null,
          admin_email: adminEmailMap[c.id] ?? null,
        })),
      );

      // Enrich feedback
      const clubIds = [...new Set((fbData ?? []).map((f) => f.club_id).filter(Boolean) as string[])];
      const submitterIds = [...new Set((fbData ?? []).map((f) => f.submitted_by).filter(Boolean) as string[])];

      const [{ data: clubNames }, { data: submitterNames }] = await Promise.all([
        clubIds.length
          ? supabase.from("clubs").select("id, club_name").in("id", clubIds)
          : Promise.resolve({ data: [] }),
        submitterIds.length
          ? supabase.from("profiles").select("id, full_name").in("id", submitterIds)
          : Promise.resolve({ data: [] }),
      ]);

      const clubNameMap: Record<string, string> = {};
      (clubNames ?? []).forEach((c) => { clubNameMap[c.id] = c.club_name; });
      const submitterMap: Record<string, string> = {};
      (submitterNames ?? []).forEach((p) => { submitterMap[p.id] = p.full_name ?? "Unknown"; });

      setFeedback(
        (fbData ?? []).map((f) => ({
          ...f,
          club_name: f.club_id ? (clubNameMap[f.club_id] ?? null) : null,
          submitter_name: f.submitted_by ? (submitterMap[f.submitted_by] ?? null) : null,
        })),
      );

      setStats({
        clubs: clubCount ?? 0,
        members: memberCount ?? 0,
        sessions: sessionCount ?? 0,
        open_feedback: openFeedbackCount ?? 0,
      });

      setLoading(false);
    })();
  }, []);

  const updateFeedback = async (id: string, patch: { status?: string; admin_notes?: string }) => {
    const { error } = await supabase.from("feedback").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setFeedback((prev) => prev.map((f) => f.id === id ? { ...f, ...patch } : f));
  };

  if (loading) {
    return (
      <AppShell title="Owner Dashboard">
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Owner Dashboard">
      {/* Stats — 2×2 mobile, 4-col desktop */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard value={stats.clubs} label="Clubs" />
          <StatCard value={stats.members} label="Active members" />
          <StatCard value={stats.sessions} label="Sessions" />
          <StatCard value={stats.open_feedback} label="Open feedback" />
        </div>
      )}

      {/* Clubs */}
      <div className="mb-2 flex items-center gap-2">
        <Building2 className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">Clubs</h2>
        <Badge variant="secondary" className="ml-auto">{clubs.length}</Badge>
      </div>

      {clubs.length === 0 ? (
        <Card className="p-4 mb-6">
          <EmptyState title="No clubs yet" description="Clubs will appear here once created." />
        </Card>
      ) : (
        <div className="space-y-4 mb-6">
          {clubs.map((c) => <ClubCard key={c.id} club={c} />)}
        </div>
      )}

      {/* Feedback inbox */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Feedback inbox</h2>
          <Badge variant="secondary" className="ml-auto">{feedback.length}</Badge>
        </div>
        {feedback.length === 0 ? (
          <EmptyState title="No feedback yet" description="Feedback submitted by users will appear here." />
        ) : (
          <div className="space-y-3">
            {feedback.map((f) => (
              <div key={f.id} className="rounded-xl border p-4 space-y-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CategoryBadge category={f.category} />
                      <StatusBadge status={f.status} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {f.submitter_name ?? "Anonymous"}{f.club_name ? ` · ${f.club_name}` : ""} · {new Date(f.created_at).toLocaleString()}
                    </div>
                  </div>
                  <Select
                    value={f.status}
                    onValueChange={(v) => updateFeedback(f.id, { status: v })}
                  >
                    <SelectTrigger className="h-8 w-[130px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In progress</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-sm">{f.message}</p>
                <Textarea
                  rows={2}
                  placeholder="Admin notes (saved on blur)…"
                  defaultValue={f.admin_notes ?? ""}
                  onBlur={(e) => {
                    const val = e.target.value.trim() || null;
                    if (val !== (f.admin_notes ?? null)) {
                      updateFeedback(f.id, { admin_notes: val ?? undefined });
                    }
                  }}
                  className="text-xs"
                />
              </div>
            ))}
          </div>
        )}
      </Card>
    </AppShell>
  );
}

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <Card className="p-4 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </Card>
  );
}

function ClubCard({ club }: { club: Club }) {
  const memberSince = new Date(club.created_at).toLocaleDateString("en-AU", { month: "short", year: "numeric" });

  const lastSessionLabel = club.last_session_at
    ? `Last training: ${new Date(club.last_session_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`
    : "No sessions yet";

  return (
    <Card className="rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-lg font-bold leading-tight">{club.club_name}</h3>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {club.state_region && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  {club.state_region}
                </span>
              )}
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                Member since {memberSince}
              </span>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                Active
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Address */}
        {club.address && (
          <div className="text-sm text-muted-foreground flex items-start gap-1.5">
            <span className="font-medium text-foreground shrink-0">Address:</span>
            <span>{club.address}</span>
          </div>
        )}

        {/* Member breakdown */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Members</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold">{club.member_count} total</span>
            <span className="text-muted-foreground text-xs">·</span>
            <RoleBadge label="Admins" count={club.role_counts.club_admin} color="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" />
            <RoleBadge label="Coaches" count={club.role_counts.coach} color="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" />
            <RoleBadge label="Members" count={club.role_counts.member} color="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" />
          </div>
        </div>

        {/* Activity stats */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-muted/50 p-2.5 text-center">
              <div className="text-lg font-bold">{club.session_total}</div>
              <div className="text-[11px] text-muted-foreground">Total sessions</div>
            </div>
            <div className="rounded-lg bg-muted/50 p-2.5 text-center">
              <div className="text-lg font-bold">{club.sessions_this_month}</div>
              <div className="text-[11px] text-muted-foreground">This month</div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-2">{lastSessionLabel}</div>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2 pt-1">
          {club.admin_email ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-8"
              asChild
            >
              <a href={`mailto:${club.admin_email}`}>
                <Mail className="h-3.5 w-3.5" />
                Email admin
              </a>
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" disabled>
              <Mail className="h-3.5 w-3.5" />
              No admin email
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" disabled>
            <ExternalLink className="h-3.5 w-3.5" />
            View club
          </Button>
        </div>
      </div>
    </Card>
  );
}

function RoleBadge({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${color}`}>
      {count} {label}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const map: Record<string, { label: string; className: string }> = {
    bug: { label: "🐛 Bug", className: "bg-red-100 text-red-700" },
    suggestion: { label: "💡 Suggestion", className: "bg-yellow-100 text-yellow-700" },
    question: { label: "❓ Question", className: "bg-blue-100 text-blue-700" },
  };
  const m = map[category] ?? { label: category, className: "bg-gray-100 text-gray-700" };
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${m.className}`}>{m.label}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: "bg-gray-100 text-gray-700",
    in_progress: "bg-blue-100 text-blue-700",
    resolved: "bg-green-100 text-green-700",
  };
  const label = status === "in_progress" ? "In progress" : status.charAt(0).toUpperCase() + status.slice(1);
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${map[status] ?? "bg-gray-100 text-gray-700"}`}>{label}</span>;
}
