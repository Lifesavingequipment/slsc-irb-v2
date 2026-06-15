import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIsPlatformOwner } from "@/lib/platform-owner";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Building2, MessageSquare, BarChart3 } from "lucide-react";
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

type Club = {
  id: string;
  club_name: string;
  state_region: string | null;
  created_at: string;
  member_count: number;
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

type Stats = { clubs: number; members: number; sessions: number };

function OwnerDashboard() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: clubData }, { data: fbData }, { count: clubCount }, { count: memberCount }, { count: sessionCount }] =
        await Promise.all([
          supabase.from("clubs").select("id, club_name, state_region, created_at").order("created_at", { ascending: false }),
          supabase
            .from("feedback")
            .select("id, club_id, submitted_by, category, message, status, admin_notes, created_at")
            .order("created_at", { ascending: false }),
          supabase.from("clubs").select("id", { count: "exact", head: true }),
          supabase.from("club_memberships").select("id", { count: "exact", head: true }).eq("status", "approved"),
          supabase.from("sessions").select("id", { count: "exact", head: true }),
        ]);

      // Get member counts per club
      const { data: memCounts } = await supabase
        .from("club_memberships")
        .select("club_id")
        .eq("status", "approved");
      const countMap: Record<string, number> = {};
      (memCounts ?? []).forEach((m) => { countMap[m.club_id] = (countMap[m.club_id] ?? 0) + 1; });

      setClubs(
        (clubData ?? []).map((c) => ({
          id: c.id,
          club_name: c.club_name,
          state_region: c.state_region,
          created_at: c.created_at,
          member_count: countMap[c.id] ?? 0,
        })),
      );

      // Enrich feedback with club names and submitter names
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
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold">{stats.clubs}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Clubs</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold">{stats.members}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Members</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold">{stats.sessions}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Sessions</div>
          </Card>
        </div>
      )}

      {/* Clubs */}
      <Card className="p-4 mb-6 space-y-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Clubs</h2>
          <Badge variant="secondary" className="ml-auto">{clubs.length}</Badge>
        </div>
        {clubs.length === 0 ? (
          <EmptyState title="No clubs yet" description="Clubs will appear here once created." />
        ) : (
          <div className="divide-y rounded-md border">
            {clubs.map((c) => (
              <div key={c.id} className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{c.club_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.state_region ?? "No region"} · {c.member_count} members · Joined {new Date(c.created_at).toLocaleDateString()}
                  </div>
                </div>
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
