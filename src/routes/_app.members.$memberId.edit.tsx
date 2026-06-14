import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useClub, useCanManage, useIsAdmin } from "@/lib/club-context";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, Trash2, Plus, Shield, Heart, Save } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useConfirm } from "@/lib/confirm";

export const Route = createFileRoute("/_app/members/$memberId/edit")({
  head: () => ({ meta: [{ title: "Edit member — IRB Coaching" }] }),
  component: EditMember,
});

type AgeDivision = "u23" | "open" | "masters_35" | "masters_45";
const AGE_LABELS: Record<AgeDivision, string> = {
  u23: "U23", open: "Open", masters_35: "Masters 35+", masters_45: "Masters 45+",
};
const ROLE_OPTIONS = [
  { value: "driver", label: "Driver" },
  { value: "crew", label: "Crew" },
  { value: "patient", label: "Patient" },
] as const;
const CLUB_ROLES = [
  { value: "member", label: "Member" },
  { value: "coach", label: "Coach" },
  { value: "club_admin", label: "Club Admin" },
] as const;

type EC = {
  id?: string;
  name: string;
  relationship: string;
  phone: string;
  email: string;
  is_primary: boolean;
};

const profileSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(80),
  last_name: z.string().trim().min(1, "Last name is required").max(80),
  email: z.string().trim().email().max(255).or(z.literal("")),
  phone: z.string().trim().max(40).or(z.literal("")),
  date_of_birth: z.string().max(10).or(z.literal("")),
});

function EditMember() {
  const { memberId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeClub } = useClub();
  const canManage = useCanManage();
  const isAdmin = useIsAdmin();

  const isSelf = user?.id === memberId;
  const clubId = activeClub?.club_id ?? null;
  const canEditProfile = isSelf || canManage;

  // Profile
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [ageDivision, setAgeDivision] = useState<AgeDivision | "">("");
  const [preferredRoles, setPreferredRoles] = useState<string[]>([]);

  // Roles in this club (only admin can change)
  const [clubRoles, setClubRoles] = useState<string[]>([]);

  // Emergency contacts
  const [contacts, setContacts] = useState<EC[]>([]);
  const [removedContactIds, setRemovedContactIds] = useState<string[]>([]);

  // Medical
  const [medId, setMedId] = useState<string | null>(null);
  const [bloodType, setBloodType] = useState("");
  const [allergies, setAllergies] = useState("");
  const [medications, setMedications] = useState("");
  const [conditions, setConditions] = useState("");
  const [medNotes, setMedNotes] = useState("");

  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    if (!clubId) return;
    setLoading(true);
    const [pRes, idRes, rRes, ecRes, miRes] = await Promise.all([
      supabase.from("members")
        .select("first_name, last_name, preferred_name, email, phone, driver_flag, crew_flag, patient_flag")
        .eq("auth_user_id", memberId).eq("club_id", clubId).maybeSingle(),
      supabase.from("profile_identity")
        .select("date_of_birth").eq("user_id", memberId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("club_id", clubId).eq("user_id", memberId),
      (supabase.from("member_emergency_contacts"))
        .select("*").eq("club_id", clubId).eq("user_id", memberId).order("is_primary", { ascending: false }),
      (supabase.from("member_medical_info"))
        .select("*").eq("club_id", clubId).eq("user_id", memberId).maybeSingle(),
    ]);
    const p = (pRes.data ?? {}) as Record<string, unknown>;
    const idRow = (idRes.data ?? {}) as Record<string, unknown>;
    setFirstName((p.first_name as string) ?? "");
    setLastName((p.last_name as string) ?? "");
    setEmail((p.email as string) ?? (isSelf ? user?.email ?? "" : ""));
    setPhone((p.phone as string) ?? "");
    setDob((idRow.date_of_birth as string) ?? "");
    setGender("");
    setAgeDivision("");
    setPreferredRoles([
      ...(p.driver_flag ? ["driver"] : []),
      ...(p.crew_flag ? ["crew"] : []),
      ...(p.patient_flag ? ["patient"] : []),
    ]);


    setClubRoles(((rRes.data ?? []) as { role: string }[]).map((r) => r.role));

    const ecRows = ((ecRes as { data?: unknown }).data ?? []) as Array<Record<string, unknown>>;
    setContacts(ecRows.map((r) => ({
      id: r.id as string,
      name: (r.name as string) ?? "",
      relationship: (r.relationship as string) ?? "",
      phone: (r.phone as string) ?? "",
      email: (r.email as string) ?? "",
      is_primary: Boolean(r.is_primary),
    })));

    const mi = (miRes as { data?: Record<string, unknown> | null }).data ?? null;
    if (mi) {
      setMedId(mi.id as string);
      setBloodType((mi.blood_type as string) ?? "");
      setAllergies((mi.allergies as string) ?? "");
      setMedications((mi.medications as string) ?? "");
      setConditions((mi.conditions as string) ?? "");
      setMedNotes((mi.notes as string) ?? "");
    } else {
      setMedId(null);
    }
    setLoading(false);
  }, [clubId, memberId, isSelf, user?.email]);

  useEffect(() => { load(); }, [load]);

  const toggleRole = (role: string) =>
    setPreferredRoles((prev) => prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]);

  const toggleClubRole = (role: string) =>
    setClubRoles((prev) => prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]);

  const updateContact = (i: number, patch: Partial<EC>) =>
    setContacts((prev) => prev.map((c, idx) => idx === i ? { ...c, ...patch } : (
      patch.is_primary ? { ...c, is_primary: false } : c
    )));

  const addContact = () => setContacts((p) => [...p, {
    name: "", relationship: "", phone: "", email: "", is_primary: p.length === 0,
  }]);

  const removeContact = async (i: number) => {
    const ok = await confirm({
      title: "Remove emergency contact?",
      description: "Are you sure? This cannot be undone.",
      confirmText: "Remove",
    });
    if (!ok) return;
    setContacts((prev) => {
      const c = prev[i];
      if (c.id) setRemovedContactIds((r) => [...r, c.id!]);
      return prev.filter((_, idx) => idx !== i);
    });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clubId) return;

    const parsed = profileSchema.safeParse({
      first_name: firstName, last_name: lastName, email, phone, date_of_birth: dob,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    for (const c of contacts) {
      if (!c.name.trim() || !c.phone.trim()) {
        toast.error("Each emergency contact needs a name and phone");
        return;
      }
    }

    setBusy(true);
    try {
      // 1. Member record
      const { error: pErr } = await supabase.from("members").update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        driver_flag: preferredRoles.includes("driver"),
        crew_flag: preferredRoles.includes("crew"),
        patient_flag: preferredRoles.includes("patient"),
      }).eq("auth_user_id", memberId).eq("club_id", clubId);
      if (pErr) throw pErr;

      // 1b. Identity (sensitive)
      const { error: idErr } = await supabase.from("profile_identity").upsert({
        user_id: memberId,
        date_of_birth: dob || null,
      }, { onConflict: "user_id" });
      if (idErr) throw idErr;


      // 2. Roles (admins only, others)
      if (isAdmin && !isSelf) {
        // diff against current
        const { data: existing } = await supabase.from("user_roles")
          .select("role").eq("club_id", clubId).eq("user_id", memberId);
        const cur = new Set(((existing ?? []) as { role: string }[]).map((r) => r.role));
        const next = new Set(clubRoles);
        // never touch owner
        cur.delete("owner");
        const toAdd = [...next].filter((r) => !cur.has(r) && r !== "owner");
        const toRemove = [...cur].filter((r) => !next.has(r));
        for (const r of toRemove) {
          await supabase.from("user_roles").delete()
            .eq("club_id", clubId).eq("user_id", memberId).eq("role", r as never);
        }
        if (toAdd.length > 0) {
          await supabase.from("user_roles").insert(
            toAdd.map((r) => ({ club_id: clubId, user_id: memberId, role: r as never })),
          );
        }
      }

      // 3. Emergency contacts — deletes
      if (removedContactIds.length > 0) {
        await (supabase.from("member_emergency_contacts"))
          .delete().in("id", removedContactIds);
      }
      // upserts
      for (const c of contacts) {
        const payload = {
          user_id: memberId, club_id: clubId,
          name: c.name.trim(),
          relationship: c.relationship.trim() || null,
          phone: c.phone.trim(),
          email: c.email.trim() || null,
          is_primary: c.is_primary,
        };
        if (c.id) {
          await (supabase.from("member_emergency_contacts"))
            .update(payload).eq("id", c.id);
        } else {
          await (supabase.from("member_emergency_contacts"))
            .insert(payload);
        }
      }

      // 4. Medical info — upsert single row
      const miPayload = {
        user_id: memberId, club_id: clubId,
        blood_type: bloodType.trim() || null,
        allergies: allergies.trim() || null,
        medications: medications.trim() || null,
        conditions: conditions.trim() || null,
        notes: medNotes.trim() || null,
      };
      if (medId) {
        await (supabase.from("member_medical_info"))
          .update(miPayload).eq("id", medId);
      } else if (bloodType || allergies || medications || conditions || medNotes) {
        await (supabase.from("member_medical_info"))
          .insert(miPayload);
      }

      toast.success("Member saved");
      navigate({ to: "/members/$memberId", params: { memberId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  if (!canEditProfile) {
    return (
      <AppShell>
        <div className="py-12 text-center text-sm text-muted-foreground">
          You don't have permission to edit this member.
        </div>
      </AppShell>
    );
  }

  if (loading) {
    return <AppShell><div className="py-12 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;
  }

  return (
    <AppShell>
      <Link to="/members/$memberId" params={{ memberId }} className="inline-flex items-center text-sm text-muted-foreground mb-2">
        <ChevronLeft className="h-4 w-4" /> Back
      </Link>
      <h1 className="text-2xl font-bold mb-4">{isSelf ? "Edit my profile" : "Edit member"}</h1>

      <form onSubmit={save} className="space-y-4 pb-24">
        {/* Profile */}
        <Card className="p-4">
          <div className="text-sm font-semibold mb-3">Profile</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="first">First name</Label>
              <Input id="first" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last">Last name</Label>
              <Input id="last" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                disabled={isSelf} placeholder={isSelf ? "Email comes from your login" : "name@example.com"} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dob">Date of birth</Label>
              <Input id="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gender">Gender</Label>
              <Select value={gender || "__none"} onValueChange={(v) => setGender(v === "__none" ? "" : v)}>
                <SelectTrigger id="gender"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Prefer not to say</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="age">Age division</Label>
              <Select
                value={ageDivision || "__none"}
                onValueChange={(v) => setAgeDivision(v === "__none" ? "" : (v as AgeDivision))}
              >
                <SelectTrigger id="age"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Not set</SelectItem>
                  {(Object.keys(AGE_LABELS) as AgeDivision[]).map((k) => (
                    <SelectItem key={k} value={k}>{AGE_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Preferred roles</Label>
              <div className="grid grid-cols-3 gap-2">
                {ROLE_OPTIONS.map((r) => (
                  <Button
                    key={r.value} type="button"
                    variant={preferredRoles.includes(r.value) ? "default" : "outline"}
                    onClick={() => toggleRole(r.value)} className="h-10"
                  >
                    {r.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Club roles (admin only) */}
        {isAdmin && !isSelf && (
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <div className="text-sm font-semibold">Club role</div>
            </div>
            {clubRoles.includes("owner") && (
              <p className="text-xs text-muted-foreground mb-2">This member is the club owner and that role can't be changed here.</p>
            )}
            <div className="grid grid-cols-3 gap-2">
              {CLUB_ROLES.map((r) => (
                <Button
                  key={r.value} type="button"
                  variant={clubRoles.includes(r.value) ? "default" : "outline"}
                  onClick={() => toggleClubRole(r.value)} className="h-10"
                >
                  {r.label}
                </Button>
              ))}
            </div>
          </Card>
        )}

        {/* Emergency contacts */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">Emergency contacts</div>
            <Button type="button" size="sm" variant="outline" onClick={addContact}>
              <Plus className="h-4 w-4 mr-1.5" /> Add
            </Button>
          </div>
          {contacts.length === 0 ? (
            <p className="text-xs text-muted-foreground">No emergency contacts yet.</p>
          ) : (
            <div className="space-y-4">
              {contacts.map((c, i) => (
                <div key={c.id ?? `new-${i}`} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Contact {i + 1}</div>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeContact(i)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Full name" value={c.name} onChange={(e) => updateContact(i, { name: e.target.value })} />
                    <Input placeholder="Relationship" value={c.relationship} onChange={(e) => updateContact(i, { relationship: e.target.value })} />
                    <Input placeholder="Phone" value={c.phone} onChange={(e) => updateContact(i, { phone: e.target.value })} />
                    <Input placeholder="Email (optional)" type="email" value={c.email} onChange={(e) => updateContact(i, { email: e.target.value })} />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox checked={c.is_primary} onCheckedChange={(v) => updateContact(i, { is_primary: Boolean(v) })} />
                    Primary contact
                  </label>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Medical info */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Heart className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm font-semibold">Medical info</div>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="blood">Blood type</Label>
              <Input id="blood" value={bloodType} onChange={(e) => setBloodType(e.target.value)} placeholder="e.g. O+" maxLength={6} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="allergies">Allergies</Label>
              <Textarea id="allergies" value={allergies} onChange={(e) => setAllergies(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meds">Medications</Label>
              <Textarea id="meds" value={medications} onChange={(e) => setMedications(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cond">Conditions</Label>
              <Textarea id="cond" value={conditions} onChange={(e) => setConditions(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mnotes">Other notes</Label>
              <Textarea id="mnotes" value={medNotes} onChange={(e) => setMedNotes(e.target.value)} rows={2} />
            </div>
          </div>
        </Card>

        <div className="sticky bottom-4 z-10">
          <Button type="submit" disabled={busy} className="w-full h-11 shadow-lg">
            <Save className="h-4 w-4 mr-2" /> {busy ? "Saving…" : "Save member"}
          </Button>
        </div>
      </form>
    </AppShell>
  );
}

function splitName(full: string): [string, string] {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0) return ["", ""];
  if (parts.length === 1) return [parts[0], ""];
  return [parts[0], parts.slice(1).join(" ")];
}
