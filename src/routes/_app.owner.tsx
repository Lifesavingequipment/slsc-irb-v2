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
import { Building2, MessageSquare, Users, CalendarDays, Mail, ExternalLink, HelpCircle, ChevronDown, ChevronRight, ShieldAlert, ArrowLeft } from "lucide-react";
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

type ClubMember = {
  membership_id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  status: "pending" | "approved" | "rejected";
};

type Club = {
  id: string;
  club_name: string;
  state_region: string | null;
  address: string | null;
  created_at: string | null;
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
  created_at: string | null;
  club_name: string | null;
  submitter_name: string | null;
};

type Stats = { clubs: number; members: number; sessions: number; open_feedback: number };

type SupportRequest = {
  id: string;
  name: string;
  email: string;
  message: string;
  created_at: string;
};

function OwnerDashboard() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [supportRequests, setSupportRequests] = useState<SupportRequest[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [
        { data: clubData },
        { data: fbData },
        { data: srData },
        { count: clubCount },
        { count: memberCount },
        { count: sessionCount },
        { count: openFeedbackCount },
        { data: memCounts },
        { data: sessionData },
        { data: coachList },
      ] = await Promise.all([
        supabase.from("clubs").select("id, club_name, state_region, address, created_at").order("created_at", { ascending: false }),
        supabase.from("feedback").select("id, club_id, submitted_by, category, message, status, admin_notes, created_at").order("created_at", { ascending: false }),
        supabase.from("onboarding_support_requests").select("id, name, email, message, created_at").order("created_at", { ascending: false }),
        supabase.from("clubs").select("id", { count: "exact", head: true }),
        supabase.from("club_memberships").select("id", { count: "exact", head: true }).eq("status", "approved"),
        supabase.from("sessions").select("id", { count: "exact", head: true }),
        supabase.from("feedback").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("club_memberships").select("club_id, role").eq("status", "approved"),
        supabase.from("sessions").select("club_id, starts_at").order("starts_at", { ascending: false }),
        supabase.rpc("list_club_admin_emails"),
      ]);

      // member count map + role count map (both from club_memberships)
      const memCountMap: Record<string, number> = {};
      const roleCountMap: Record<string, RoleCount> = {};
      (memCounts ?? []).forEach((m) => {
        memCountMap[m.club_id] = (memCountMap[m.club_id] ?? 0) + 1;
        if (!roleCountMap[m.club_id]) roleCountMap[m.club_id] = { club_admin: 0, coach: 0, member: 0, owner: 0 };
        const role = (m.role ?? "member") as keyof RoleCount;
        if (role in roleCountMap[m.club_id]) roleCountMap[m.club_id][role]++;
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

      // admin email map from club_memberships via RPC
      const adminEmailMap: Record<string, string> = {};
      (coachList ?? []).forEach((c: { club_id: string; email: string }) => {
        if (c.email && !adminEmailMap[c.club_id]) adminEmailMap[c.club_id] = c.email;
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

      setSupportRequests(srData ?? []);

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

  if (selectedClub) {
    return <ClubDetailView club={selectedClub} onBack={() => setSelectedClub(null)} />;
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
          {clubs.map((c) => <ClubCard key={c.id} club={c} onViewClub={() => setSelectedClub(c)} />)}
        </div>
      )}

      {/* Support Requests */}
      <Card className="p-4 space-y-3 mb-6">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Support Requests</h2>
          <Badge variant="secondary" className="ml-auto">{supportRequests.length}</Badge>
        </div>
        {supportRequests.length === 0 ? (
          <EmptyState title="No support requests" description="Onboarding help requests will appear here." />
        ) : (
          <div className="space-y-3">
            {supportRequests.map((sr) => (
              <div key={sr.id} className="rounded-xl border p-4 space-y-1.5">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <div className="font-medium text-sm">{sr.name}</div>
                    <a href={`mailto:${sr.email}`} className="text-xs text-primary underline">{sr.email}</a>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {new Date(sr.created_at).toLocaleString()}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{sr.message}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

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
                      {f.submitter_name ?? "Anonymous"}{f.club_name ? ` · ${f.club_name}` : ""} · {f.created_at ? new Date(f.created_at).toLocaleString() : "—"}
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

function ClubDetailView({ club, onBack }: { club: Club; onBack: () => void }) {
  const memberSince = club.created_at ? new Date(club.created_at).toLocaleDateString("en-AU", { month: "short", year: "numeric" }) : "—";
  const lastSessionLabel = club.last_session_at
    ? `Last training: ${new Date(club.last_session_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`
    : "No sessions yet";

  return (
    <AppShell title={club.club_name}>
      <div className="mb-4">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 text-muted-foreground" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back to Owner Dashboard
        </Button>
      </div>

      {/* Club header */}
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap gap-1.5 mb-3">
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

        {club.address && (
          <div className="text-sm text-muted-foreground flex items-start gap-1.5 mb-3">
            <span className="font-medium text-foreground shrink-0">Address:</span>
            <span>{club.address}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="rounded-lg bg-muted/50 p-2.5 text-center">
            <div className="text-lg font-bold">{club.session_total}</div>
            <div className="text-[11px] text-muted-foreground">Total sessions</div>
          </div>
          <div className="rounded-lg bg-muted/50 p-2.5 text-center">
            <div className="text-lg font-bold">{club.sessions_this_month}</div>
            <div className="text-[11px] text-muted-foreground">This month</div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">{lastSessionLabel}</div>

        {club.admin_email && (
          <div className="mt-3">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-8"
              onClick={() => { window.location.href = `mailto:${club.admin_email}`; }}
            >
              <Mail className="h-3.5 w-3.5" />
              Email admin
            </Button>
          </div>
        )}
      </Card>

      {/* Manage Members */}
      <div className="mb-2 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">Manage Members</h2>
        <Badge variant="secondary" className="ml-auto">{club.member_count}</Badge>
      </div>
      <ClubMembersCard club={club} />
    </AppShell>
  );
}


function ClubMembersCard({ club }: { club: Club }) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    if (loaded) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("club_memberships")
      .select("id, user_id, role, status")
      .eq("club_id", club.id)
      .order("status");

    if (error) { toast.error(error.message); setLoading(false); return; }

    const userIds = (data ?? []).map((m) => m.user_id);
    if (userIds.length === 0) { setMembers([]); setLoaded(true); setLoading(false); return; }

    const [{ data: memberData }, { data: profileData }] = await Promise.all([
      supabase.from("members").select("auth_user_id, first_name, last_name").eq("club_id", club.id).in("auth_user_id", userIds),
      supabase.from("profiles").select("id, email, full_name").in("id", userIds),
    ]);

    const memberMap: Record<string, { first_name: string; last_name: string }> = {};
    (memberData ?? []).forEach((m) => { if (m.auth_user_id) memberMap[m.auth_user_id] = { first_name: m.first_name, last_name: m.last_name }; });

    const emailMap: Record<string, string> = {};
    const profileNameMap: Record<string, string> = {};
    (profileData ?? []).forEach((p) => {
      if (p.email) emailMap[p.id] = p.email;
      if (p.full_name) profileNameMap[p.id] = p.full_name;
    });

    setMembers(
      (data ?? []).map((m) => {
        const fromMembers = memberMap[m.user_id];
        const profileFull = profileNameMap[m.user_id];
        const [profileFirst, ...profileRest] = profileFull ? profileFull.split(" ") : [];
        return {
          membership_id: m.id,
          user_id: m.user_id,
          first_name: fromMembers?.first_name ?? profileFirst ?? "Unknown",
          last_name: fromMembers?.last_name ?? profileRest.join(" ") ?? "",
          email: emailMap[m.user_id] ?? "—",
          role: m.role ?? "member",
          status: m.status,
        };
      }),
    );
    setLoaded(true);
    setLoading(false);
  };

  const toggle = () => {
    if (!open) load();
    setOpen((v) => !v);
  };

  const updateMember = async (membershipId: string, patch: { role?: string; status?: "pending" | "approved" | "rejected" }) => {
    const update: { role?: string; status?: "pending" | "approved" | "rejected"; approved_at?: string } = {};
    if (patch.role) update.role = patch.role;
    if (patch.status) {
      update.status = patch.status;
      if (patch.status === "approved") update.approved_at = new Date().toISOString();
    }
    const { error } = await supabase.from("club_memberships").update(update).eq("id", membershipId);
    if (error) { toast.error(error.message); return; }
    setMembers((prev) =>
      prev.map((m) => m.membership_id === membershipId ? { ...m, ...patch } : m),
    );
    toast.success("Member updated");
  };

  return (
    <Card className="overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
        <span className="font-medium text-sm">{club.club_name}</span>
        <Badge variant="secondary" className="ml-auto text-xs">{club.member_count} members</Badge>
      </button>

      {open && (
        <div className="border-t">
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground text-center">Loading members…</div>
          ) : members.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">No members found.</div>
          ) : (
            <div className="divide-y">
              {members.map((m) => (
                <MemberRow key={m.membership_id} member={m} onSave={(patch) => updateMember(m.membership_id, patch)} />
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

const ROLES = ["member", "coach", "club_admin"] as const;
const STATUSES = ["pending", "approved", "rejected"] as const;

function MemberRow({ member, onSave }: { member: ClubMember; onSave: (patch: { role?: string; status?: "pending" | "approved" | "rejected" }) => Promise<void> }) {
  const [role, setRole] = useState(member.role);
  const [status, setStatus] = useState(member.status);
  const [saving, setSaving] = useState(false);

  const dirty = role !== member.role || status !== member.status;

  const save = async () => {
    setSaving(true);
    const patch: { role?: string; status?: "pending" | "approved" | "rejected" } = {};
    if (role !== member.role) patch.role = role;
    if (status !== member.status) patch.status = status;
    await onSave(patch);
    setSaving(false);
  };

  const statusColor: Record<string, string> = {
    approved: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
    rejected: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      {/* Row 1: name + status badge */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{member.first_name} {member.last_name}</div>
          <div className="text-xs text-muted-foreground truncate">{member.email}</div>
        </div>
        <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${statusColor[member.status] ?? "bg-gray-100 text-gray-700"}`}>
          {member.status}
        </span>
      </div>

      {/* Row 2: role select + status select + save button */}
      <div className="flex items-center gap-2">
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="h-7 w-[110px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r} className="text-xs">{r === "club_admin" ? "Admin" : r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={(v) => setStatus(v as "pending" | "approved" | "rejected")}>
          <SelectTrigger className="h-7 w-[100px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          size="sm"
          className="h-7 px-3 text-xs"
          disabled={!dirty || saving}
          onClick={save}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
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

function ClubCard({ club, onViewClub }: { club: Club; onViewClub: () => void }) {
  const memberSince = club.created_at ? new Date(club.created_at).toLocaleDateString("en-AU", { month: "short", year: "numeric" }) : "—";

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
              onClick={() => { window.location.href = `mailto:${club.admin_email}`; }}
            >
              <Mail className="h-3.5 w-3.5" />
              Email admin
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" disabled>
              <Mail className="h-3.5 w-3.5" />
              No admin email
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" onClick={onViewClub}>
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
