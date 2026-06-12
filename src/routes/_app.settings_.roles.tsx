import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClub, useIsAdmin } from "@/lib/club-context";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Search, Shield, UserCog, History } from "lucide-react";
import { toast } from "sonner";
import { buildNameMap, memberFullName } from "@/lib/names";
import { roleBadgeClass, roleLabel } from "@/lib/role-colors";
import {
  useCoachPermissions, COACH_PERM_LABELS, type CoachPermKey, type CoachPermissions,
} from "@/lib/coach-permissions";

export const Route = createFileRoute("/_app/settings_/roles")({
  head: () => ({ meta: [{ title: "Roles & Permissions — IRB Coaching" }] }),
  component: RolesPage,
});

type RoleName = "club_admin" | "coach";

type Row = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  phone: string | null;
  roles: string[];
};

function initials(n?: string | null) {
  const s = (n ?? "").trim();
  if (!s) return "?";
  return s.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function RolesPage() {
  const isAdmin = useIsAdmin();
  const { activeClub } = useClub();

  if (!activeClub) {
    return <AppShell><div className="py-12 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;
  }
  if (!isAdmin) return <Navigate to="/settings" replace />;

  return <RolesPageInner clubId={activeClub.club_id} />;
}

function RolesPageInner({ clubId }: { clubId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: mems } = await supabase
      .from("club_memberships")
      .select("user_id")
      .eq("club_id", clubId)
      .eq("status", "approved");
    const ids = (mems ?? []).map((m) => m.user_id);
    if (ids.length === 0) { setRows([]); setLoading(false); return; }
    const [{ data: memberData }, { data: r }] = await Promise.all([
      supabase.from("members").select("auth_user_id, first_name, last_name, preferred_name, phone").in("auth_user_id", ids).eq("club_id", clubId),
      supabase.from("user_roles").select("user_id, role").eq("club_id", clubId).in("user_id", ids),
    ]);
    const roleMap: Record<string, string[]> = {};
    (r ?? []).forEach((x) => {
      roleMap[x.user_id] = [...(roleMap[x.user_id] ?? []), x.role];
    });
    const pmap = new Map((memberData ?? []).map((m) => [m.auth_user_id, m]));
    setRows(
      ids.map((id) => {
        const m = pmap.get(id);
        return {
          user_id: id,
          first_name: m?.first_name ?? null,
          last_name: m?.last_name ?? null,
          preferred_name: m?.preferred_name ?? null,
          phone: m?.phone ?? null,
          roles: roleMap[id] ?? [],
        };
      }),
    );
    setLoading(false);
  }, [clubId]);

  useEffect(() => { load(); }, [load]);

  const nameMap = useMemo(
    () => buildNameMap(rows.map((r) => ({ id: r.user_id, full_name: memberFullName(r, "") || null })), "Unnamed"),
    [rows],
  );
  const dn = (id: string) => nameMap[id] || "Unnamed";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (q) {
          const n = dn(r.user_id).toLowerCase();
          const ph = (r.phone ?? "").toLowerCase();
          if (!n.includes(q) && !ph.includes(q)) return false;
        }
        if (roleFilter !== "all") {
          if (roleFilter === "member") {
            if (r.roles.some((x) => x === "owner" || x === "club_admin" || x === "coach")) return false;
          } else if (!r.roles.includes(roleFilter)) return false;
        }
        return true;
      })
      .sort((a, b) => dn(a.user_id).localeCompare(dn(b.user_id)));
  }, [rows, search, roleFilter, nameMap]);

  const toggleRole = async (userId: string, role: RoleName, on: boolean) => {
    setBusyId(userId + role);
    const { error } = on
      ? await supabase.rpc("assign_club_role", { _user_id: userId, _club_id: clubId, _role: role })
      : await supabase.rpc("revoke_club_role", { _user_id: userId, _club_id: clubId, _role: role });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success(on ? `Granted ${roleLabel(role)}` : `Revoked ${roleLabel(role)}`);
    load();
  };

  return (
    <AppShell title="Roles & Permissions">
      <Link to="/settings" className="inline-flex items-center text-sm text-muted-foreground mb-3">
        <ChevronLeft className="h-4 w-4" /> Settings
      </Link>

      <CoachPermissionsCard clubId={clubId} />

      <Card className="p-4 mt-4 space-y-3">
        <div className="flex items-center gap-2">
          <UserCog className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Member roles</h2>
          <Badge variant="secondary" className="ml-auto">{rows.length}</Badge>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or phone"
              className="pl-9 h-9"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="owner">Owner</SelectItem>
              <SelectItem value="club_admin">Club admin</SelectItem>
              <SelectItem value="coach">Assistant coach</SelectItem>
              <SelectItem value="member">Member only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No members match.</p>
        ) : (
          <div className="divide-y rounded-md border">
            {filtered.map((m) => {
              const isOwner = m.roles.includes("owner");
              const isAdminRole = m.roles.includes("club_admin");
              const isCoach = m.roles.includes("coach");
              return (
                <div key={m.user_id} className="p-3 flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>{initials(memberFullName(m, ""))}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <Link to="/members/$memberId" params={{ memberId: m.user_id }} className="font-medium truncate hover:underline">
                      {dn(m.user_id)}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {isOwner && <Badge className={`text-[10px] uppercase ${roleBadgeClass("owner")}`}>Owner</Badge>}
                      {isAdminRole && <Badge className={`text-[10px] uppercase ${roleBadgeClass("club_admin")}`}>Club admin</Badge>}
                      {isCoach && <Badge className={`text-[10px] uppercase ${roleBadgeClass("coach")}`}>Assistant coach</Badge>}
                      {!isOwner && !isAdminRole && !isCoach && (
                        <Badge variant="secondary" className="text-[10px] uppercase">Member</Badge>
                      )}
                    </div>
                  </div>
                  {isOwner ? (
                    <Badge variant="outline" className="text-[10px]">Locked</Badge>
                  ) : (
                    <div className="flex flex-col items-end gap-1.5">
                      <label className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Admin</span>
                        <Switch
                          checked={isAdminRole}
                          disabled={busyId === m.user_id + "club_admin"}
                          onCheckedChange={(v) => toggleRole(m.user_id, "club_admin", v)}
                        />
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Coach</span>
                        <Switch
                          checked={isCoach}
                          disabled={busyId === m.user_id + "coach"}
                          onCheckedChange={(v) => toggleRole(m.user_id, "coach", v)}
                        />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <AuditLogCard clubId={clubId} />
    </AppShell>
  );
}

function CoachPermissionsCard({ clubId }: { clubId: string }) {
  const { perms, loading, refresh } = useCoachPermissions(clubId);
  const [draft, setDraft] = useState<CoachPermissions>(perms);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(perms); }, [perms]);

  const dirty = (Object.keys(draft) as CoachPermKey[]).some((k) => draft[k] !== perms[k]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("update_coach_permissions", {
      _club_id: clubId,
      _manage_equipment:      draft.manage_equipment,
      _view_medical:          draft.view_medical,
      _view_emergency:        draft.view_emergency,
      _manage_attendance:     draft.manage_attendance,
      _manage_waves:          draft.manage_waves,
      _manage_documents:      draft.manage_documents,
      _manage_member_rsvps:   draft.manage_member_rsvps,
      _manage_templates:      draft.manage_templates,
      _manage_training_plans: draft.manage_training_plans,
      _view_survey_results:   draft.view_survey_results,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Coach permissions updated");
    refresh();
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">Assistant coach permissions</h2>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">
        Choose what assistant coaches in this club are allowed to do. Club admins and owners always have full access.
      </p>
      {loading ? (
        <p className="py-3 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="divide-y rounded-md border">
          {(Object.keys(COACH_PERM_LABELS) as CoachPermKey[]).map((key) => {
            const meta = COACH_PERM_LABELS[key];
            return (
              <label key={key} className="p-3 flex items-start gap-3 cursor-pointer">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{meta.label}</div>
                  <div className="text-xs text-muted-foreground">{meta.description}</div>
                </div>
                <Switch
                  checked={draft[key]}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, [key]: v }))}
                />
              </label>
            );
          })}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={!dirty || saving} onClick={() => setDraft(perms)}>
          Reset
        </Button>
        <Button size="sm" disabled={!dirty || saving} onClick={save}>
          {saving ? "Saving…" : "Save permissions"}
        </Button>
      </div>
    </Card>
  );
}

type AuditEntry = {
  id: string;
  actor_user_id: string;
  action: string;
  target_user_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

function AuditLogCard({ clubId }: { clubId: string }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("audit_log")
        .select("id, actor_user_id, action, target_user_id, details, created_at")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false })
        .limit(25);
      const list = (data ?? []) as AuditEntry[];
      setEntries(list);
      const ids = Array.from(
        new Set(list.flatMap((e) => [e.actor_user_id, e.target_user_id].filter(Boolean) as string[])),
      );
      if (ids.length > 0) {
        const { data: mems } = await supabase
          .from("members").select("auth_user_id, first_name, last_name, preferred_name").in("auth_user_id", ids).eq("club_id", clubId);
        const map: Record<string, string> = {};
        (mems ?? []).forEach((m) => { map[m.auth_user_id] = memberFullName(m) || "Unknown"; });
        setNames(map);
      }
    })();
  }, [clubId]);

  if (entries.length === 0) return null;

  const describe = (e: AuditEntry) => {
    const actor = names[e.actor_user_id] ?? "Someone";
    const target = e.target_user_id ? (names[e.target_user_id] ?? "a member") : "";
    const role = (e.details as { role?: string } | null)?.role;
    switch (e.action) {
      case "assign_role":            return `${actor} granted ${role ?? "role"} to ${target}`;
      case "revoke_role":            return `${actor} revoked ${role ?? "role"} from ${target}`;
      case "update_coach_permissions": return `${actor} updated coach permissions`;
      default:                       return `${actor} · ${e.action}`;
    }
  };

  return (
    <Card className="p-4 mt-4 space-y-2">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">Recent activity</h2>
      </div>
      <div className="divide-y rounded-md border text-sm">
        {entries.map((e) => (
          <div key={e.id} className="p-2.5">
            <div>{describe(e)}</div>
            <div className="text-[10px] text-muted-foreground">{new Date(e.created_at).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
