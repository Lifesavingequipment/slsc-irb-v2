import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClub, useIsAdmin, useCanManage } from "@/lib/club-context";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { X, Trash2, Search, ChevronRight, ChevronDown, Users, UserPlus, Handshake, TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { buildNameMap, memberFullName } from "@/lib/names";
import { roleBadgeClass, roleLabel } from "@/lib/role-colors";
import { notifyMembers } from "@/lib/notify";
import { InviteShareCard } from "@/components/members/InviteShareCard";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";
import { useConfirm } from "@/lib/confirm";

type MembersSearch = { tab?: "approved" | "pending" | "partners" };

export const Route = createFileRoute("/_app/members/")({
  head: () => ({ meta: [{ title: "Members — IRB Coaching" }] }),
  validateSearch: (search: Record<string, unknown>): MembersSearch => {
    const tab = search.tab;
    if (tab === "approved" || tab === "pending" || tab === "partners") return { tab };
    return {};
  },
  component: MembersPage,
});

// Module-level cache so navigating back doesn't blank counts to zero
// while the fresh fetch is in flight.
const membersCache = new Map<
  string,
  { rows: Row[]; roles: Record<string, string[]>; partners: Partner[] }
>();


type Row = {
  id: string;                   // members.id
  membership_id: string | null; // club_memberships.id (null for members without auth accounts)
  user_id: string;              // auth_user_id if present, else members.id as fallback key
  status: "pending" | "approved" | "rejected";
  profile: {
    first_name: string | null;
    last_name: string | null;
    preferred_name: string | null;
    phone: string | null;
    driver_flag: boolean;
    crew_flag: boolean;
    patient_flag: boolean;
  } | null;
};


type Partner = { id: string; driver_id: string; crew_id: string };

function MembersPage() {
  const { activeClub } = useClub();
  const isAdmin = useIsAdmin();
  const canManage = useCanManage();
  const { tab: initialTab } = Route.useSearch();
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);
  const clubId = activeClub?.club_id ?? null;
  const cached = clubId ? membersCache.get(clubId) : undefined;
  const [rows, setRows] = useState<Row[]>(cached?.rows ?? []);
  const [roles, setRoles] = useState<Record<string, string[]>>(cached?.roles ?? {});
  const [partners, setPartners] = useState<Partner[]>(cached?.partners ?? []);

  const load = useCallback(async () => {
    if (!activeClub) return;

    // Load all members for this club directly (includes test members without auth accounts)
    const { data: memberData } = await supabase
      .from("members")
      .select("id, auth_user_id, first_name, last_name, preferred_name, phone, driver_flag, crew_flag, patient_flag")
      .eq("club_id", activeClub.club_id);

    // Load club_memberships for status (pending/approved/rejected) keyed by auth user id
    const { data: mems } = await supabase
      .from("club_memberships")
      .select("id, user_id, status")
      .eq("club_id", activeClub.club_id);
    const membershipByUserId = new Map((mems ?? []).map((m) => [m.user_id, m]));

    const nextRows: Row[] = (memberData ?? []).map((m) => {
      const membership = m.auth_user_id ? membershipByUserId.get(m.auth_user_id) : undefined;
      return {
        id: m.id,
        membership_id: membership?.id ?? null,
        user_id: m.auth_user_id ?? m.id,
        status: (membership?.status as Row["status"]) ?? "approved",
        profile: {
          first_name: m.first_name,
          last_name: m.last_name,
          preferred_name: m.preferred_name,
          phone: m.phone,
          driver_flag: m.driver_flag ?? false,
          crew_flag: m.crew_flag ?? false,
          patient_flag: m.patient_flag ?? false,
        },
      };
    });

    // Fallback: ensure the current auth user is represented even if their members row is missing
    const { data: meAuth } = await supabase.auth.getUser();
    const meId = meAuth.user?.id ?? null;
    if (meId && !nextRows.some((r) => r.user_id === meId)) {
      const { data: selfMem } = await supabase
        .from("club_memberships")
        .select("id, user_id, status")
        .eq("club_id", activeClub.club_id)
        .eq("user_id", meId)
        .maybeSingle();
      if (selfMem) {
        nextRows.push({
          id: selfMem.id,
          membership_id: selfMem.id,
          user_id: meId,
          status: selfMem.status as Row["status"],
          profile: null,
        });
      }
    }

    setRows(nextRows);

    const { data: r } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .eq("club_id", activeClub.club_id);
    const map: Record<string, string[]> = {};
    (r ?? []).forEach((x) => {
      map[x.user_id] = [...(map[x.user_id] ?? []), x.role];
    });
    setRoles(map);

    const { data: pp } = await supabase
      .from("member_partners")
      .select("id, driver_id, crew_id")
      .eq("club_id", activeClub.club_id);
    const nextPartners = (pp ?? []) as Partner[];
    setPartners(nextPartners);

    membersCache.set(activeClub.club_id, {
      rows: nextRows,
      roles: map,
      partners: nextPartners,
    });
  }, [activeClub?.club_id]);


  useEffect(() => { load(); }, [load]);
  useRefetchOnFocus(load);

  const setStatus = async (membershipId: string, status: Row["status"]) => {
    if (!membershipId) return;
    const { error } = await supabase.from("club_memberships").update({ status }).eq("id", membershipId);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "approved" ? "Member approved" : "Updated");
    load();
  };

  const removeMember = async (memberId: string, membershipId: string | null, userId: string) => {
    if (membershipId) {
      await supabase.from("user_roles").delete().eq("club_id", activeClub!.club_id).eq("user_id", userId);
      await supabase.from("club_memberships").delete().eq("id", membershipId);
    }
    const { error } = await supabase.from("members").delete().eq("id", memberId);
    if (error) { toast.error(error.message); return; }
    toast.success("Member removed");
    load();
  };

  if (!activeClub) return null;

  const nameMap = buildNameMap(
    rows.map((r) => ({ id: r.id, full_name: r.profile ? memberFullName(r.profile, "") || null : null })),
    "Unnamed",
  );
  const display = (id: string) => nameMap[id] || "Unnamed";
  const byName = (a: Row, b: Row) => display(a.id).localeCompare(display(b.id));

  // Partner index: user_id -> first partner user_id (for "partner name" display)
  const partnerOf: Record<string, string | undefined> = {};
  partners.forEach((p) => {
    if (!partnerOf[p.driver_id]) partnerOf[p.driver_id] = p.crew_id;
    if (!partnerOf[p.crew_id]) partnerOf[p.crew_id] = p.driver_id;
  });

  return (
    <MembersPageInner
      rows={rows}
      roles={roles}
      partners={partners}
      partnerOf={partnerOf}
      display={display}
      byName={byName}
      activeClubId={activeClub.club_id}
      clubName={activeClub.club?.name}
      currentUserId={me}
      canManage={canManage}
      isAdmin={isAdmin}
      setStatus={setStatus}
      removeMember={removeMember}
      load={load}
      initialTab={initialTab}
    />
  );
}

function MembersPageInner({
  rows, roles, partners, partnerOf, display, byName,
  activeClubId, clubName, currentUserId, canManage, isAdmin,
  setStatus, removeMember, load, initialTab,
}: {
  rows: Row[];
  roles: Record<string, string[]>;
  partners: Partner[];
  partnerOf: Record<string, string | undefined>;
  display: (id: string) => string;
  byName: (a: Row, b: Row) => number;
  activeClubId: string;
  clubName?: string;
  currentUserId: string | null;
  canManage: boolean;
  isAdmin: boolean;
  setStatus: (membershipId: string, status: Row["status"]) => void;
  removeMember: (memberId: string, membershipId: string | null, userId: string) => void;
  load: () => void;
  initialTab?: "approved" | "pending" | "partners";
}) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [tab, setTab] = useState<string>(initialTab ?? "approved");
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const toggleExpanded = (id: string) => setExpandedMemberId((prev) => (prev === id ? null : id));
  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);

  const pending = useMemo(() => rows.filter((r) => r.status === "pending").sort(byName), [rows, byName]);
  const approved = useMemo(() => rows.filter((r) => r.status === "approved").sort(byName), [rows, byName]);

  const filteredApproved = useMemo(() => {
    const q = search.trim().toLowerCase();
    return approved.filter((r) => {
      if (q) {
        const name = display(r.id).toLowerCase();
        const phone = (r.profile?.phone ?? "").toLowerCase();
        if (!name.includes(q) && !phone.includes(q)) return false;
      }
      if (roleFilter !== "all") {
        const rs = roles[r.user_id] ?? [];
        const prefs = [
          ...(r.profile?.driver_flag ? ["driver"] : []),
          ...(r.profile?.crew_flag ? ["crew"] : []),
          ...(r.profile?.patient_flag ? ["patient"] : []),
        ];
        const combined = [...rs.map((x) => x.toLowerCase()), ...prefs];
        if (!combined.includes(roleFilter)) return false;
      }
      return true;
    });
  }, [approved, search, roleFilter, roles, display]);

  return (
    <AppShell>
      <h1 className="text-2xl font-bold mb-4">Members</h1>

      <div className="mb-4">
        <InviteShareCard
          clubId={activeClubId}
          clubName={clubName}
          canManage={canManage}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
        />
      </div>

      {canManage && (
        <Link
          to="/attendance"
          className="block mb-3 rounded-lg border bg-card p-3 active:bg-muted/40 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center text-accent">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">Attendance stats</div>
              <div className="text-xs text-muted-foreground">Per-member attendance % and counts</div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </Link>
      )}


      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="approved">Approved ({approved.length})</TabsTrigger>
          <TabsTrigger value="pending">Pending {pending.length > 0 && `(${pending.length})`}</TabsTrigger>
          <TabsTrigger value="partners">Partners ({partners.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="approved" className="mt-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or phone"
                className="pl-9 h-9"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="coach">Coach</SelectItem>
                <SelectItem value="club_admin">Admin</SelectItem>
                <SelectItem value="driver">Driver</SelectItem>
                <SelectItem value="crew">Crew</SelectItem>
                <SelectItem value="patient">Patient</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredApproved.length === 0 && (
            approved.length === 0 ? (
              <EmptyState
                icon={<Users className="h-5 w-5" />}
                title="No approved members yet"
                description="Share your invite code so teammates can join the club. They'll show up here once you approve them."
              />
            ) : (
              <Card className="p-6 text-center text-sm text-muted-foreground">
                No members match your filters.
              </Card>
            )
          )}
          {filteredApproved.map((m) => (
            <MemberRow
              key={m.id}
              row={m}
              displayName={display(m.id)}
              partnerName={partnerOf[m.id] ? display(partnerOf[m.id]!) : null}
              roles={roles[m.user_id] ?? []}
              canManage={canManage}
              canRemove={isAdmin && m.user_id !== currentUserId}
              isAdmin={isAdmin}
              isSelf={m.user_id === currentUserId}
              activeClubId={activeClubId}
              onRemove={() => removeMember(m.id, m.membership_id, m.user_id)}
              onChange={load}
              isExpanded={expandedMemberId === m.id}
              onToggleExpand={() => toggleExpanded(m.id)}
            />
          ))}
        </TabsContent>

        <TabsContent value="pending" className="mt-4 space-y-2">
          {pending.length === 0 && (
            <EmptyState
              icon={<UserPlus className="h-5 w-5" />}
              title="No pending requests"
              description="When someone uses your invite code to join, their request will land here for an admin to approve."
            />
          )}
          {pending.map((m) => (
            <Card key={m.id} className="p-4">
              <div className="flex items-center gap-3">
                <Avatar><AvatarFallback>{initials(memberFullName(m.profile))}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{memberFullName(m.profile, "") || display(m.id)}</div>
                  {m.profile?.phone && <div className="text-xs text-muted-foreground truncate">{m.profile.phone}</div>}
                </div>
              </div>
              {isAdmin && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button size="sm" onClick={() => setStatus(m.membership_id ?? "", "approved")}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => setStatus(m.membership_id ?? "", "rejected")}>Reject</Button>
                </div>
              )}
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="partners" className="mt-4 space-y-3">
          <PartnersPanel
            clubId={activeClubId}
            approved={approved}
            partners={partners}
            canManageAll={canManage}
            currentUserId={currentUserId}
            nameOf={display}
            onChange={load}
          />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}


function PartnersPanel({
  clubId, approved, partners, canManageAll, currentUserId, nameOf, onChange,
}: {
  clubId: string;
  approved: Row[];
  partners: Partner[];
  canManageAll: boolean;
  currentUserId: string | null;
  nameOf: (id: string) => string;
  onChange: () => void;
}) {
  const myMemberId = approved.find((r) => r.user_id === currentUserId)?.id ?? "";
  const [driver, setDriver] = useState(canManageAll ? "" : myMemberId);
  const [crew, setCrew] = useState("");
  const confirm = useConfirm();

  const pairExists = (a: string, b: string) =>
    partners.some(
      (p) =>
        (p.driver_id === a && p.crew_id === b) ||
        (p.driver_id === b && p.crew_id === a),
    );

  const addPair = async () => {
    if (!driver || !crew || driver === crew) return;
    if (pairExists(driver, crew)) { toast.info("That pair already exists"); return; }
    const { error } = await supabase.from("member_partners").insert({
      club_id: clubId, driver_id: driver, crew_id: crew,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Pair created");

    // Notify each member who they're paired with
    void notifyMembers([driver], {
      club_id: clubId,
      type: "partner_assigned",
      title: "Preferred partner set",
      body: `You've been paired with ${nameOf(crew)}`,
      link: `/members/${crew}`,
    });
    void notifyMembers([crew], {
      club_id: clubId,
      type: "partner_assigned",
      title: "Preferred partner set",
      body: `You've been paired with ${nameOf(driver)}`,
      link: `/members/${driver}`,
    });

    if (canManageAll) setDriver("");
    setCrew("");
    onChange();
  };

  const removePair = async (id: string) => {
    const p = partners.find((x) => x.id === id);
    const label = p ? `${nameOf(p.driver_id)} + ${nameOf(p.crew_id)}` : "this pair";
    const ok = await confirm({
      title: "Remove partner pair?",
      description: `${label} will no longer be paired in the system.`,
      confirmText: "Remove",
    });
    if (!ok) return;
    const { error } = await supabase.from("member_partners").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Pair removed");
    onChange();
  };

  const pairKey = (p: Partner) =>
    [nameOf(p.driver_id), nameOf(p.crew_id)].sort().join("|");
  const sortedPartners = [...partners].sort((a, b) => pairKey(a).localeCompare(pairKey(b)));
  const myPairs = myMemberId
    ? sortedPartners.filter((p) => p.driver_id === myMemberId || p.crew_id === myMemberId)
    : [];
  const otherPairs = sortedPartners.filter((p) => !myPairs.includes(p));
  const canRemove = (p: Partner) =>
    canManageAll || p.driver_id === myMemberId || p.crew_id === myMemberId;

  // For members: driver locked to themselves, crew = any other approved member
  // For admins/coaches: free choice of both
  const driverOptions = canManageAll
    ? approved
    : approved.filter((r) => r.id === myMemberId);
  const crewOptions = approved.filter((r) => r.id !== driver);

  return (
    <>
      <Card className="p-4 space-y-2">
        <div className="text-sm font-semibold">
          {canManageAll ? "Create partner pair" : "Add a teammate"}
        </div>
        <p className="text-xs text-muted-foreground">
          You can pair with multiple people — add one pair at a time.
        </p>
        <Select value={driver} onValueChange={setDriver} disabled={!canManageAll}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Driver…" /></SelectTrigger>
          <SelectContent>
            {driverOptions.map((r) => (
              <SelectItem key={r.id} value={r.id} disabled={r.id === crew}>
                {nameOf(r.id)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={crew} onValueChange={setCrew}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Teammate…" /></SelectTrigger>
          <SelectContent>
            {crewOptions.map((r) => (
              <SelectItem key={r.id} value={r.id} disabled={r.id === driver}>
                {nameOf(r.id)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={addPair} disabled={!driver || !crew} className="w-full">Pair</Button>
      </Card>

      {myPairs.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            My pairs ({myPairs.length})
          </div>
          {myPairs.map((p) => (
            <PairRow key={p.id} p={p} nameOf={nameOf} canRemove={canRemove(p)} onRemove={() => removePair(p.id)} />
          ))}
        </div>
      )}

      {otherPairs.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Other pairs ({otherPairs.length})
          </div>
          {otherPairs.map((p) => (
            <PairRow key={p.id} p={p} nameOf={nameOf} canRemove={canRemove(p)} onRemove={() => removePair(p.id)} />
          ))}
        </div>
      )}

      {partners.length === 0 && (
        <EmptyState
          icon={<Handshake className="h-5 w-5" />}
          title="No partner pairs yet"
          description="Pair a driver and crew so the wave-draw tool can keep them together when teams are built for each session."
        />

      )}
    </>
  );
}

function PairRow({ p, nameOf, canRemove, onRemove }: {
  p: Partner; nameOf: (id: string) => string; canRemove: boolean; onRemove: () => void;
}) {
  return (
    <Card className="p-3 flex items-center justify-between gap-2">
      <div className="text-sm">
        <span className="font-medium">{nameOf(p.driver_id)}</span>
        <span className="text-muted-foreground"> driver · </span>
        <span className="font-medium">{nameOf(p.crew_id)}</span>
        <span className="text-muted-foreground"> crew</span>
      </div>
      {canRemove && (
        <Button size="icon" variant="ghost" onClick={onRemove}>
          <X className="h-4 w-4 text-destructive" />
        </Button>
      )}
    </Card>
  );
}

const ROLE_OPTIONS = ["Driver", "Crew", "Patient"] as const;

function MemberRow({ row, displayName, partnerName, roles, canManage, canRemove, isAdmin, isSelf, activeClubId, onRemove, onChange, isExpanded, onToggleExpand }: {
  row: Row; displayName: string; partnerName: string | null; roles: string[]; canManage: boolean; canRemove?: boolean; isAdmin?: boolean; isSelf?: boolean; activeClubId?: string; onRemove?: () => void; onChange: () => void; isExpanded?: boolean; onToggleExpand?: () => void;
}) {
  const serverPr = [
    ...(row.profile?.driver_flag ? ["Driver"] : []),
    ...(row.profile?.crew_flag ? ["Crew"] : []),
    ...(row.profile?.patient_flag ? ["Patient"] : []),
  ];
  const [optimistic, setOptimistic] = useState<string[] | null>(null);
  const pr = optimistic ?? serverPr;
  const [saving, setSaving] = useState(false);
  const [roleBusy, setRoleBusy] = useState<string | null>(null);

  const isOwnerRole = roles.includes("owner");
  const isClubAdmin = roles.includes("club_admin");
  const isCoach = roles.includes("coach");

  const toggleClubRole = async (role: "club_admin" | "coach", on: boolean) => {
    if (!activeClubId) return;
    setRoleBusy(role);
    const { error } = on
      ? await supabase.rpc("assign_club_role", { _user_id: row.user_id, _club_id: activeClubId, _role: role })
      : await supabase.rpc("revoke_club_role", { _user_id: row.user_id, _club_id: activeClubId, _role: role });
    setRoleBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(on ? `${roleLabel(role)} granted` : `${roleLabel(role)} revoked`);
    onChange();
  };

  const toggle = async (role: string) => {
    const wasActive = pr.includes(role);
    const next = wasActive ? pr.filter((r) => r !== role) : [...pr, role];
    setOptimistic(next);
    setSaving(true);
    const flagKey = `${role.toLowerCase()}_flag` as "driver_flag" | "crew_flag" | "patient_flag";
    const { error } = await supabase.from("members")
      .update({ [flagKey]: !wasActive })
      .eq("id", row.id);
    setSaving(false);
    if (error) {
      setOptimistic(serverPr);
      toast.error(error.message);
      return;
    }
    toast.success(wasActive ? `${role} removed` : `${role} added`);
    onChange();
  };

  // Color-coded role badges combine club role(s) + preferred roles, deduped case-insensitively.
  const combinedRoles: string[] = [];
  [...roles, ...pr].forEach((r) => {
    if (!combinedRoles.find((x) => x.toLowerCase() === r.toLowerCase())) combinedRoles.push(r);
  });
  if (combinedRoles.length === 0) combinedRoles.push("member");

  return (
    <Card className="p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <Avatar><AvatarFallback>{initials(memberFullName(row.profile, ""))}</AvatarFallback></Avatar>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">
              <Link
                to="/members/$memberId"
                params={{ memberId: row.user_id }}
                className="hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {displayName}
              </Link>
              {isSelf && <Badge variant="secondary" className="ml-2 text-[10px] uppercase">You</Badge>}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {partnerName ? (
                <>Partner: <span className="text-foreground">{partnerName}</span></>
              ) : (
                <span className="italic">Unpaired</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {combinedRoles.map((r) => (
                <Badge key={r} className={`text-[10px] uppercase ${roleBadgeClass(r)}`}>
                  {roleLabel(r)}
                </Badge>
              ))}
            </div>
          </div>
          {isExpanded
            ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
        </button>
        {canRemove && onRemove && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove member?</AlertDialogTitle>
                <AlertDialogDescription>
                  {displayName} will lose access to the club. This can't be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onRemove}>Remove</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      {isExpanded && canManage && (
        <div className="mt-3 flex gap-1.5">
          {ROLE_OPTIONS.map((role) => {
            const active = pr.includes(role);
            return (
              <Button
                key={role}
                size="sm"
                variant="outline"
                className={`flex-1 h-8 text-xs ${active ? "border-red-500 text-red-600 bg-red-50 hover:bg-red-100" : ""}`}
                disabled={saving}
                onClick={() => toggle(role)}
              >
                {role}
              </Button>
            );
          })}
        </div>
      )}
      {isExpanded && isAdmin && activeClubId && !isOwnerRole && (
        <div className="mt-2 flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              className="h-3.5 w-3.5"
              checked={isClubAdmin}
              disabled={roleBusy === "club_admin"}
              onChange={(e) => toggleClubRole("club_admin", e.target.checked)}
            />
            <span className="text-muted-foreground">Admin</span>
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              className="h-3.5 w-3.5"
              checked={isCoach}
              disabled={roleBusy === "coach"}
              onChange={(e) => toggleClubRole("coach", e.target.checked)}
            />
            <span className="text-muted-foreground">Assistant coach</span>
          </label>
        </div>
      )}
      {isExpanded && isAdmin && isOwnerRole && (
        <div className="mt-2 text-[10px] uppercase text-muted-foreground">Owner role is locked</div>
      )}
    </Card>
  );
}


function initials(name?: string | null) {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}

