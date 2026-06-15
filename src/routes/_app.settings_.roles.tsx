import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClub, useIsAdmin } from "@/lib/club-context";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, Search, Shield, UserCog } from "lucide-react";
import { toast } from "sonner";
import { buildNameMap, memberFullName } from "@/lib/names";
import { roleBadgeClass, roleLabel } from "@/lib/role-colors";

export const Route = createFileRoute("/_app/settings_/roles")({
  head: () => ({ meta: [{ title: "Roles & Permissions — IRB Coaching" }] }),
  component: RolesPage,
});

type ClubRole = "club_admin" | "coach" | "assistant_coach" | "member";

const ROLE_OPTIONS: { value: ClubRole; label: string }[] = [
  { value: "club_admin", label: "Club Admin" },
  { value: "coach", label: "Coach" },
  { value: "assistant_coach", label: "Asst. Coach" },
  { value: "member", label: "Member" },
];

const PERM_TABS: { value: ClubRole; label: string }[] = [
  { value: "coach", label: "Coach" },
  { value: "assistant_coach", label: "Asst. Coach" },
  { value: "member", label: "Member" },
];

const PERMISSIONS: { key: string; label: string; description: string }[] = [
  { key: "view_medical_info",   label: "View medical info",      description: "See member allergies, medications and conditions." },
  { key: "view_member_profiles",label: "View member profiles",   description: "Access full member profile pages." },
  { key: "create_sessions",     label: "Create sessions",        description: "Add new training sessions." },
  { key: "edit_sessions",       label: "Edit sessions",          description: "Modify existing training sessions." },
  { key: "delete_sessions",     label: "Delete sessions",        description: "Remove training sessions." },
  { key: "edit_templates",      label: "Edit templates",         description: "Create and edit saved templates." },
  { key: "delete_templates",    label: "Delete templates",       description: "Remove saved templates." },
  { key: "manage_gear",         label: "Manage gear",            description: "Add, edit and remove equipment." },
  { key: "manage_wave_draw",    label: "Manage wave draw",       description: "Build session waves and assign crews." },
  { key: "manage_carpool",      label: "Manage carpool",         description: "Create and edit carpool arrangements." },
];

type Row = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  phone: string | null;
  roles: string[];
  is_primary_admin: boolean;
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
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [transferTarget, setTransferTarget] = useState<Row | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: memberData } = await supabase
      .from("members")
      .select("id, auth_user_id, first_name, last_name, preferred_name, phone")
      .eq("club_id", clubId)
      .eq("membership_status", "active")
      .order("first_name");
    const authIds = (memberData ?? []).map((m) => m.auth_user_id).filter(Boolean) as string[];
    const { data: r } = authIds.length
      ? await supabase.from("club_roles").select("user_id, role, is_primary_admin").eq("club_id", clubId).in("user_id", authIds)
      : { data: [] as { user_id: string; role: string; is_primary_admin: boolean }[] };
    const roleMap: Record<string, string[]> = {};
    const adminMap: Record<string, boolean> = {};
    (r ?? []).forEach((x) => {
      roleMap[x.user_id] = [...(roleMap[x.user_id] ?? []), x.role];
      if (x.is_primary_admin) adminMap[x.user_id] = true;
    });
    setRows(
      (memberData ?? []).map((m) => {
        const key = m.auth_user_id ?? m.id;
        return {
          user_id: key,
          first_name: m.first_name ?? null,
          last_name: m.last_name ?? null,
          preferred_name: m.preferred_name ?? null,
          phone: m.phone ?? null,
          roles: roleMap[key] ?? [],
          is_primary_admin: !!adminMap[key],
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

  const currentUserPrimaryAdmin = rows.find((r) => r.user_id === user?.id)?.is_primary_admin ?? false;

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
            if (r.roles.some((x) => x === "club_admin" || x === "coach" || x === "assistant_coach")) return false;
          } else if (!r.roles.includes(roleFilter)) return false;
        }
        return true;
      })
      .sort((a, b) => dn(a.user_id).localeCompare(dn(b.user_id)));
  }, [rows, search, roleFilter, nameMap]);

  const setRole = async (userId: string, role: ClubRole, on: boolean) => {
    setBusyId(userId + role);
    if (on) {
      const { error } = await supabase.from("club_roles").upsert(
        { club_id: clubId, user_id: userId, role },
        { onConflict: "club_id,user_id,role" },
      );
      if (error) { toast.error(error.message); setBusyId(null); return; }
    } else {
      const { error } = await supabase.from("club_roles")
        .delete()
        .eq("club_id", clubId)
        .eq("user_id", userId)
        .eq("role", role);
      if (error) { toast.error(error.message); setBusyId(null); return; }
    }
    setBusyId(null);
    toast.success(on ? `Granted ${roleLabel(role)}` : `Revoked ${roleLabel(role)}`);
    load();
  };

  const transferAdmin = async () => {
    if (!transferTarget || !user) return;
    const { error: e1 } = await supabase.from("club_roles")
      .update({ is_primary_admin: false })
      .eq("club_id", clubId)
      .eq("user_id", user.id);
    if (e1) { toast.error(e1.message); return; }
    await supabase.from("club_roles").upsert(
      { club_id: clubId, user_id: transferTarget.user_id, role: "club_admin", is_primary_admin: true },
      { onConflict: "club_id,user_id,role" },
    );
    toast.success(`Primary admin transferred to ${dn(transferTarget.user_id)}`);
    setTransferOpen(false);
    setTransferTarget(null);
    load();
  };

  return (
    <AppShell title="Roles & Permissions">
      <Link to="/settings" className="inline-flex items-center text-sm text-muted-foreground mb-3">
        <ChevronLeft className="h-4 w-4" /> Settings
      </Link>

      <Card className="p-4 mb-4 space-y-3">
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
            <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="club_admin">Club admin</SelectItem>
              <SelectItem value="coach">Coach</SelectItem>
              <SelectItem value="assistant_coach">Asst. coach</SelectItem>
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
              const isAdmin = m.roles.includes("club_admin");
              const isCoach = m.roles.includes("coach");
              const isAsst = m.roles.includes("assistant_coach");
              const isSelf = m.user_id === user?.id;
              return (
                <div key={m.user_id} className="p-3 flex items-start gap-3">
                  <Avatar className="h-9 w-9 shrink-0 mt-0.5">
                    <AvatarFallback>{initials(memberFullName(m, ""))}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link to="/members/$memberId" params={{ memberId: m.user_id }} className="font-medium truncate hover:underline">
                        {dn(m.user_id)}
                      </Link>
                      {m.is_primary_admin && (
                        <Badge className="text-[10px] bg-amber-500 text-white">Primary admin</Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {isAdmin && <Badge className={`text-[10px] uppercase ${roleBadgeClass("club_admin")}`}>Club admin</Badge>}
                      {isCoach && <Badge className={`text-[10px] uppercase ${roleBadgeClass("coach")}`}>Coach</Badge>}
                      {isAsst && <Badge className={`text-[10px] uppercase ${roleBadgeClass("assistant_coach")}`}>Asst. coach</Badge>}
                      {!isAdmin && !isCoach && !isAsst && (
                        <Badge variant="secondary" className="text-[10px] uppercase">Member</Badge>
                      )}
                    </div>
                    {currentUserPrimaryAdmin && isAdmin && !isSelf && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1 h-7 text-xs text-muted-foreground px-2"
                        onClick={() => { setTransferTarget(m); setTransferOpen(true); }}
                      >
                        Transfer primary admin
                      </Button>
                    )}
                  </div>
                  {!isSelf && (
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {ROLE_OPTIONS.filter((r) => r.value !== "member").map(({ value, label }) => (
                        <label key={value} className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">{label}</span>
                          <Switch
                            checked={m.roles.includes(value)}
                            disabled={busyId === m.user_id + value}
                            onCheckedChange={(v) => setRole(m.user_id, value, v)}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                  {isSelf && (
                    <Badge variant="outline" className="text-[10px] shrink-0">You</Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <PermissionsCard clubId={clubId} />

      <AlertDialog open={transferOpen} onOpenChange={setTransferOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transfer primary admin?</AlertDialogTitle>
            <AlertDialogDescription>
              {transferTarget ? `${dn(transferTarget.user_id)} will become the primary admin. You will keep your club admin role but lose primary admin status.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={transferAdmin} className="bg-[#E63329] text-white hover:bg-[#c0392b]">
              Transfer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function PermissionsCard({ clubId }: { clubId: string }) {
  const [perms, setPerms] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("club_permissions")
        .select("role, permission, enabled")
        .eq("club_id", clubId)
        .in("role", ["coach", "assistant_coach", "member"]);
      const map: Record<string, Record<string, boolean>> = {};
      (data ?? []).forEach((row) => {
        map[row.role] = map[row.role] ?? {};
        map[row.role][row.permission] = row.enabled;
      });
      setPerms(map);
      setLoading(false);
    })();
  }, [clubId]);

  const toggle = async (role: string, permission: string, enabled: boolean) => {
    const key = role + permission;
    setSaving(key);
    setPerms((prev) => ({
      ...prev,
      [role]: { ...(prev[role] ?? {}), [permission]: enabled },
    }));
    const { error } = await supabase.from("club_permissions").upsert(
      { club_id: clubId, role, permission, enabled, updated_at: new Date().toISOString() },
      { onConflict: "club_id,role,permission" },
    );
    setSaving(null);
    if (error) {
      toast.error(error.message);
      setPerms((prev) => ({
        ...prev,
        [role]: { ...(prev[role] ?? {}), [permission]: !enabled },
      }));
    } else {
      toast.success(`Permission ${enabled ? "enabled" : "disabled"}`);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">Permission toggles</h2>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">
        Club admins always have full access. Configure what other roles can do.
      </p>
      {loading ? (
        <p className="py-3 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <Tabs defaultValue="coach">
          <TabsList className="w-full">
            {PERM_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="flex-1">{t.label}</TabsTrigger>
            ))}
          </TabsList>
          {PERM_TABS.map((tab) => (
            <TabsContent key={tab.value} value={tab.value}>
              <div className="divide-y rounded-md border mt-2">
                {PERMISSIONS.map((p) => {
                  const enabled = !!(perms[tab.value]?.[p.key]);
                  const busy = saving === tab.value + p.key;
                  return (
                    <label key={p.key} className="p-3 flex items-start gap-3 cursor-pointer">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{p.label}</div>
                        <div className="text-xs text-muted-foreground">{p.description}</div>
                      </div>
                      <Switch
                        checked={enabled}
                        disabled={busy}
                        onCheckedChange={(v) => toggle(tab.value, p.key, v)}
                      />
                    </label>
                  );
                })}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </Card>
  );
}
