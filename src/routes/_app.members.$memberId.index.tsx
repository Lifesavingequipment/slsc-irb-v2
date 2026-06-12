import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useClub, useCanManage, useIsAdmin } from "@/lib/club-context";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, Trash2, Mail, Phone, Users, Pencil, ShieldAlert, Heart } from "lucide-react";
import { toast } from "sonner";
import { buildNameMap } from "@/lib/names";
import { useConfirm } from "@/lib/confirm";
import { roleBadgeClass, roleLabel } from "@/lib/role-colors";

export const Route = createFileRoute("/_app/members/$memberId/")({
  head: () => ({ meta: [{ title: "Member — IRB Coaching" }] }),
  component: MemberDetail,
});

type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  gender: string | null;
  age_division: string | null;
  preferred_roles: string[];
};

type Partner = { id: string; driver_id: string; crew_id: string };
type EmergencyContact = { id: string; name: string; phone: string; email: string | null; relationship: string | null; is_primary: boolean };
type MedicalInfo = { blood_type: string | null; allergies: string | null; medications: string | null; conditions: string | null; notes: string | null };

function MemberDetail() {
  const { memberId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeClub } = useClub();
  const canManage = useCanManage();
  const isAdmin = useIsAdmin();
  const confirm = useConfirm();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [otherProfiles, setOtherProfiles] = useState<Profile[]>([]);
  const [membershipId, setMembershipId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [medical, setMedical] = useState<MedicalInfo | null>(null);

  const isSelf = user?.id === memberId;
  const clubId = activeClub?.club_id ?? null;

  const load = useCallback(async () => {
    if (!clubId) return;
    setLoading(true);
    setLoadError(null);
    const [pRes, rRes, ppRes, mRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, phone, gender, age_division, preferred_roles")
        .eq("id", memberId)
        .maybeSingle(),
      supabase
        .from("user_roles")
        .select("role")
        .eq("club_id", clubId)
        .eq("user_id", memberId),
      supabase
        .from("member_partners")
        .select("id, driver_id, crew_id")
        .eq("club_id", clubId)
        .or(`driver_id.eq.${memberId},crew_id.eq.${memberId}`),
      supabase
        .from("club_memberships")
        .select("id")
        .eq("club_id", clubId)
        .eq("user_id", memberId)
        .maybeSingle(),
    ]);
    if (pRes.error) {
      setLoadError(pRes.error.message);
      setLoading(false);
      return;
    }
    if (!pRes.data) {
      setLoadError("Member not found or not accessible.");
      setLoading(false);
      return;
    }
    setProfile(pRes.data as Profile);
    setRoles(((rRes.data as { role: string }[] | null) ?? []).map((r) => r.role));
    setPartners((ppRes.data as Partner[] | null) ?? []);
    setMembershipId((mRes.data?.id as string | undefined) ?? null);

    // Load other approved members for partner picker
    const { data: mems } = await supabase
      .from("club_memberships")
      .select("user_id")
      .eq("club_id", clubId)
      .eq("status", "approved");
    const ids = (mems ?? []).map((m) => m.user_id).filter((id) => id !== memberId);
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, phone, gender, age_division, preferred_roles")
        .in("id", ids);
      setOtherProfiles((profs as Profile[] | null) ?? []);
    } else {
      setOtherProfiles([]);
    }

    // Load privacy-sensitive data only when viewer can manage (RLS enforces too)
    if (canManage || isSelf) {
      const [ecRes, miRes] = await Promise.all([
        supabase
          .from("member_emergency_contacts")
          .select("id, name, phone, email, relationship, is_primary")
          .eq("club_id", clubId)
          .eq("user_id", memberId)
          .order("is_primary", { ascending: false }),
        supabase
          .from("member_medical_info")
          .select("blood_type, allergies, medications, conditions, notes")
          .eq("club_id", clubId)
          .eq("user_id", memberId)
          .maybeSingle(),
      ]);
      setEmergencyContacts((ecRes.data as EmergencyContact[] | null) ?? []);
      setMedical((miRes.data as MedicalInfo | null) ?? null);
    } else {
      setEmergencyContacts([]);
      setMedical(null);
    }
    setLoading(false);
  }, [clubId, memberId, canManage, isSelf]);

  useEffect(() => {
    load();
  }, [load]);

  const nameMap = useMemo(() => {
    const all = [
      ...(profile ? [profile] : []),
      ...otherProfiles,
    ].map((p) => ({ id: p.id, full_name: p.full_name }));
    return buildNameMap(all, "Unnamed");
  }, [profile, otherProfiles]);
  const dn = (id: string) => nameMap[id] || "Unnamed";

  const removeMember = async () => {
    if (!clubId || !membershipId) return;
    setBusy(true);
    await supabase.from("user_roles").delete().eq("club_id", clubId).eq("user_id", memberId);
    const { error } = await supabase.from("club_memberships").delete().eq("id", membershipId);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Member removed");
    navigate({ to: "/members" });
  };

  const pairWith = async (otherId: string) => {
    if (!clubId || !otherId) return;
    // Default: current member is driver, picked person is crew
    const exists = partners.some(
      (p) =>
        (p.driver_id === memberId && p.crew_id === otherId) ||
        (p.driver_id === otherId && p.crew_id === memberId),
    );
    if (exists) { toast.info("Already paired"); return; }
    setBusy(true);
    const { error } = await supabase.from("member_partners").insert({
      club_id: clubId,
      driver_id: memberId,
      crew_id: otherId,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Partner assigned");
    load();
  };

  const unpair = async (id: string) => {
    const p = partners.find((x) => x.id === id);
    const otherId = p ? (p.driver_id === memberId ? p.crew_id : p.driver_id) : null;
    const ok = await confirm({
      title: "Remove this partner pairing?",
      description: otherId ? `${dn(profile?.id ?? "")} and ${dn(otherId)} will no longer be paired.` : "This pairing will be removed.",
      confirmText: "Remove",
    });
    if (!ok) return;
    const { error } = await supabase.from("member_partners").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Pairing removed");
    load();
  };

  if (loading) {
    return (
      <AppShell>
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }
  if (!profile) {
    return (
      <AppShell>
        <Link to="/members" className="inline-flex items-center text-sm text-muted-foreground mb-2">
          <ChevronLeft className="h-4 w-4" /> Members
        </Link>
        <Card className="p-6 text-center">
          <p className="text-sm font-medium">Couldn't load this member</p>
          <p className="text-xs text-muted-foreground mt-1">{loadError ?? "Unknown error"}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={load}>Retry</Button>
        </Card>
      </AppShell>
    );
  }

  const allRoles = [...roles];
  profile.preferred_roles?.forEach((r) => {
    if (!allRoles.find((x) => x.toLowerCase() === r.toLowerCase())) allRoles.push(r);
  });

  // Partner pick options: approved members not already paired with this member
  const pairedIds = new Set<string>();
  partners.forEach((p) => {
    pairedIds.add(p.driver_id);
    pairedIds.add(p.crew_id);
  });
  const partnerOptions = otherProfiles.filter((p) => !pairedIds.has(p.id));

  return (
    <AppShell>
      <Link to="/members" className="inline-flex items-center text-sm text-muted-foreground mb-2">
        <ChevronLeft className="h-4 w-4" /> Members
      </Link>

      <Card className="p-5">
        <div className="flex items-start gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-lg">{initials(profile.full_name)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate">{dn(profile.id)}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {allRoles.length === 0 ? (
                <Badge variant="secondary" className="text-[10px] uppercase">Member</Badge>
              ) : (
                allRoles.map((r) => (
                  <Badge key={r} className={`text-[10px] uppercase ${roleBadgeClass(r)}`}>
                    {roleLabel(r)}
                  </Badge>
                ))
              )}
              {profile.age_division && (
                <Badge variant="outline" className="text-[10px] uppercase">
                  {profile.age_division.replace("_", " ")}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          {profile.phone && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-4 w-4" />
              <a href={`tel:${profile.phone}`} className="hover:underline">{profile.phone}</a>
            </div>
          )}
          {profile.gender && (
            <div className="text-muted-foreground">
              <span className="text-xs uppercase tracking-wide mr-2">Gender</span>{profile.gender}
            </div>
          )}
        </div>

        {(isSelf || canManage) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {isSelf ? (
              <Button asChild size="sm" variant="outline">
                <Link to="/settings">
                  <Pencil className="h-4 w-4 mr-1.5" /> Edit my profile
                </Link>
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link to="/members/$memberId/edit" params={{ memberId }}>
                  <Pencil className="h-4 w-4 mr-1.5" /> Edit member
                </Link>
              </Button>
            )}
            {canManage && !isSelf && profile.phone && (
              <Button size="sm" variant="outline" asChild>
                <a href={`tel:${profile.phone}`}><Mail className="h-4 w-4 mr-1.5" /> Call</a>
              </Button>
            )}
          </div>
        )}
      </Card>

      <Card className="p-4 mt-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-semibold">Partners ({partners.length})</div>
        </div>
        {partners.length === 0 ? (
          <p className="text-xs text-muted-foreground">Unpaired.</p>
        ) : (
          <div className="space-y-2">
            {partners.map((p) => {
              const partnerId = p.driver_id === memberId ? p.crew_id : p.driver_id;
              const role = p.driver_id === memberId ? "crew" : "driver";
              return (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border p-2.5">
                  <Link to="/members/$memberId" params={{ memberId: partnerId }} className="text-sm font-medium hover:underline">
                    {dn(partnerId)}
                  </Link>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] uppercase">as {role}</Badge>
                    {(canManage || isSelf) && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => unpair(p.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {canManage && partnerOptions.length > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <Select onValueChange={pairWith} disabled={busy}>
              <SelectTrigger className="h-9 flex-1">
                <SelectValue placeholder="Assign partner…" />
              </SelectTrigger>
              <SelectContent>
                {partnerOptions
                  .slice()
                  .sort((a, b) => dn(a.id).localeCompare(dn(b.id)))
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>{dn(p.id)}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </Card>

      {(canManage || isSelf) && (
        <Card className="p-4 mt-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              <div className="text-sm font-semibold">Emergency contacts</div>
              {!isSelf && (
                <Badge variant="outline" className="text-[10px] uppercase">Coach view</Badge>
              )}
            </div>
            {isSelf && (
              <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                <Link to="/settings">Edit</Link>
              </Button>
            )}
          </div>
          {emergencyContacts.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {isSelf ? "No emergency contacts added. Add one in Settings." : "This member hasn't added emergency contacts yet."}
            </p>
          ) : (
            <div className="space-y-2">
              {emergencyContacts.map((c) => (
                <div key={c.id} className="rounded-md border p-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    {c.is_primary && <Badge className="text-[10px] uppercase">Primary</Badge>}
                    {c.relationship && (
                      <span className="text-xs text-muted-foreground">· {c.relationship}</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <a href={`tel:${c.phone}`} className="hover:underline inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {c.phone}
                    </a>
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="hover:underline inline-flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {c.email}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!isSelf && (
            <p className="mt-3 text-[10px] text-muted-foreground">
              Visible to coaches and admins only. Members manage their own details in Settings.
            </p>
          )}
        </Card>
      )}

      {(canManage || isSelf) && (
        <Card className="p-4 mt-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Heart className="h-4 w-4 text-muted-foreground" />
              <div className="text-sm font-semibold">Medical info</div>
              {!isSelf && (
                <Badge variant="outline" className="text-[10px] uppercase">Coach view</Badge>
              )}
            </div>
            {isSelf && (
              <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                <Link to="/settings">Edit</Link>
              </Button>
            )}
          </div>
          {!medical || (!medical.blood_type && !medical.allergies && !medical.medications && !medical.conditions && !medical.notes) ? (
            <p className="text-xs text-muted-foreground">
              {isSelf ? "No medical info on file. Add details in Settings." : "No medical info on file."}
            </p>
          ) : (
            <dl className="grid grid-cols-1 gap-2 text-sm">
              {medical.blood_type && (
                <div><dt className="text-xs uppercase text-muted-foreground">Blood type</dt><dd>{medical.blood_type}</dd></div>
              )}
              {medical.allergies && (
                <div><dt className="text-xs uppercase text-muted-foreground">Allergies</dt><dd className="whitespace-pre-wrap">{medical.allergies}</dd></div>
              )}
              {medical.medications && (
                <div><dt className="text-xs uppercase text-muted-foreground">Medications</dt><dd className="whitespace-pre-wrap">{medical.medications}</dd></div>
              )}
              {medical.conditions && (
                <div><dt className="text-xs uppercase text-muted-foreground">Conditions</dt><dd className="whitespace-pre-wrap">{medical.conditions}</dd></div>
              )}
              {medical.notes && (
                <div><dt className="text-xs uppercase text-muted-foreground">Notes</dt><dd className="whitespace-pre-wrap">{medical.notes}</dd></div>
              )}
            </dl>
          )}
          {!isSelf && (
            <p className="mt-3 text-[10px] text-muted-foreground">
              Visible to coaches and admins only. Members manage their own details in Settings.
            </p>
          )}
        </Card>
      )}


      {isAdmin && !isSelf && membershipId && (
        <div className="mt-6">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-full text-destructive border-destructive/30 hover:bg-destructive/10">
                <Trash2 className="h-4 w-4 mr-2" /> Remove member
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove member?</AlertDialogTitle>
                <AlertDialogDescription>
                  {dn(profile.id)} will lose access to the club. This can't be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={removeMember}>Remove</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </AppShell>
  );
}

function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}
