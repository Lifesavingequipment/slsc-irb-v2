import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useClub, useCanManage } from "@/lib/club-context";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { LocationsSection } from "@/components/settings/LocationsSection";
import {
  LogOut, Plus, Trash2, ShieldAlert, HeartPulse, User, Mail, KeyRound,
  Bell, MapPin, GripVertical, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/lib/confirm";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — IRB Coaching" }] }),
  component: SettingsPage,
});

type AgeDivision = "u23" | "open" | "masters_35" | "masters_45";
const AGE_LABELS: Record<AgeDivision, string> = {
  u23: "U23", open: "Open", masters_35: "Masters 35+", masters_45: "Masters 45+",
};
const ROLE_OPTIONS: { value: "driver" | "crew" | "patient"; label: string }[] = [
  { value: "driver", label: "Driver" },
  { value: "crew", label: "Crew" },
  { value: "patient", label: "Patient" },
];

type EmergencyContact = {
  id: string;
  club_id: string;
  name: string;
  phone: string;
  relationship: string | null;
  email: string | null;
  is_primary: boolean;
};

type MedicalInfo = {
  id?: string;
  club_id: string;
  allergies: string;
  medications: string;
  notes: string;
};

type Prefs = {
  notify_session_reminders: boolean;
  notify_new_sessions: boolean;
  notify_carpool_updates: boolean;
  notify_equipment: boolean;
  notify_join_requests: boolean;
  notify_fault_reports: boolean;
  notify_carpool_pending: boolean;
};

const DEFAULT_PREFS: Prefs = {
  notify_session_reminders: true,
  notify_new_sessions: true,
  notify_carpool_updates: true,
  notify_equipment: true,
  notify_join_requests: true,
  notify_fault_reports: true,
  notify_carpool_pending: true,
};

type SectionKey = "profile" | "email" | "password" | "notifications" | "emergency" | "medical" | "clubs" | "locations";
const DEFAULT_ORDER: SectionKey[] = ["profile", "email", "password", "notifications", "emergency", "medical", "clubs", "locations"];

function SettingsPage() {
  const { user, signOut } = useAuth();
  const { activeClub, memberships, isPlatformOwner } = useClub();
  const canManage = useCanManage();
  const navigate = useNavigate();
  const confirm = useConfirm();

  // Profile
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<string>("");
  const [ageDivision, setAgeDivision] = useState<AgeDivision | "">("");
  const [preferredRoles, setPreferredRoles] = useState<string[]>([]);
  const [dob, setDob] = useState<string>("");
  const [passportNumber, setPassportNumber] = useState("");
  const [passportExpiry, setPassportExpiry] = useState("");
  const [nationality, setNationality] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Email
  const [email, setEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  // Password
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // Emergency contacts (across all approved clubs)
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [savingContacts, setSavingContacts] = useState(false);

  // Medical info (per active club)
  const [medical, setMedical] = useState<MedicalInfo | null>(null);
  const [savingMedical, setSavingMedical] = useState(false);

  // Preferences
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [order, setOrder] = useState<SectionKey[]>(DEFAULT_ORDER);
  // All sections collapsed by default for a cleaner Settings landing.
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    profile: false, email: false, password: false, notifications: false,
    emergency: false, medical: false, clubs: false, locations: false,
  });
  const [dragKey, setDragKey] = useState<SectionKey | null>(null);

  const approvedClubIds = memberships.filter((m) => m.status === "approved").map((m) => m.club_id);
  const activeClubId = activeClub?.club_id ?? approvedClubIds[0];

  useEffect(() => {
    if (!user) return;
    setEmail(user.email ?? "");
    supabase.from("profiles")
      .select("full_name, phone, gender, age_division, preferred_roles, nationality")
      .eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        setFullName(data?.full_name ?? "");
        setPhone(data?.phone ?? "");
        setGender(data?.gender ?? "");
        setAgeDivision((data?.age_division as AgeDivision) ?? "");
        setPreferredRoles((data?.preferred_roles as string[]) ?? []);
        setNationality((data as any)?.nationality ?? "");
      });
    supabase.from("profile_identity")
      .select("date_of_birth, passport_number, passport_expiry")
      .eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        setDob((data?.date_of_birth as string) ?? "");
        setPassportNumber((data?.passport_number as string) ?? "");
        setPassportExpiry((data?.passport_expiry as string) ?? "");
      });
  }, [user?.id]);


  useEffect(() => {
    if (!user || approvedClubIds.length === 0) return;
    supabase.from("member_emergency_contacts")
      .select("id, club_id, name, phone, relationship, email, is_primary")
      .eq("user_id", user.id)
      .in("club_id", approvedClubIds)
      .then(({ data }) => setContacts((data as EmergencyContact[]) ?? []));
  }, [user?.id, approvedClubIds.join(",")]);

  useEffect(() => {
    if (!user || !activeClubId) return;
    supabase.from("member_medical_info")
      .select("id, club_id, allergies, medications, notes")
      .eq("user_id", user.id).eq("club_id", activeClubId).maybeSingle()
      .then(({ data }) => {
        setMedical({
          id: data?.id,
          club_id: activeClubId,
          allergies: data?.allergies ?? "",
          medications: data?.medications ?? "",
          notes: data?.notes ?? "",
        });
      });
  }, [user?.id, activeClubId]);

  // Load preferences (order + notification toggles)
  useEffect(() => {
    if (!user) return;
    supabase.from("member_preferences")
      .select("settings_section_order, notify_session_reminders, notify_new_sessions, notify_carpool_updates, notify_equipment, notify_join_requests, notify_fault_reports, notify_carpool_pending")
      .eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setPrefs({
          notify_session_reminders: data.notify_session_reminders,
          notify_new_sessions: data.notify_new_sessions,
          notify_carpool_updates: data.notify_carpool_updates,
          notify_equipment: data.notify_equipment,
          notify_join_requests: data.notify_join_requests,
          notify_fault_reports: data.notify_fault_reports,
          notify_carpool_pending: data.notify_carpool_pending,
        });
        const saved = (data.settings_section_order as string[]) ?? [];
        if (saved.length) {
          // Merge: keep saved order, append any new sections not yet stored
          const filtered = saved.filter((k): k is SectionKey => (DEFAULT_ORDER as string[]).includes(k));
          const missing = DEFAULT_ORDER.filter((k) => !filtered.includes(k));
          setOrder([...filtered, ...missing]);
        }
      });
  }, [user?.id]);

  const persistOrder = async (next: SectionKey[]) => {
    if (!user) return;
    await supabase.from("member_preferences")
      .upsert({ user_id: user.id, settings_section_order: next }, { onConflict: "user_id" });
  };

  const persistPrefs = async (next: Prefs) => {
    if (!user) return;
    const { error } = await supabase.from("member_preferences")
      .upsert({ user_id: user.id, ...next }, { onConflict: "user_id" });
    if (error) toast.error(error.message);
  };

  const updatePref = (key: keyof Prefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    persistPrefs(next);
  };

  const toggleRole = (role: string) => {
    setPreferredRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase.from("profiles")
      .update({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        gender: gender || null,
        age_division: (ageDivision || null) as AgeDivision | null,
        preferred_roles: preferredRoles,
        nationality: nationality.trim() || null,
      })
      .eq("id", user.id);
    if (!error) {
      const { error: idErr } = await supabase.from("profile_identity").upsert({
        user_id: user.id,
        date_of_birth: dob || null,
        passport_number: passportNumber.trim() || null,
        passport_expiry: passportExpiry || null,
      }, { onConflict: "user_id" });
      if (idErr) { setSavingProfile(false); toast.error(idErr.message); return; }
    }
    setSavingProfile(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile saved");
  };


  const saveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !email.trim() || email === user.email) return;
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    setSavingEmail(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Check your inbox to confirm the new email.");
  };

  const addContact = () => {
    if (!activeClubId) return;
    setContacts((prev) => {
      // Don't add another empty card if one already exists.
      if (prev.some((c) => !c.name.trim() && !c.phone.trim())) return prev;
      return [...prev, {
        id: `new-${Date.now()}`, club_id: activeClubId,
        name: "", phone: "", relationship: "", email: "",
        is_primary: prev.length === 0,
      }];
    });
  };

  const updateContact = (id: string, patch: Partial<EmergencyContact>) => {
    setContacts((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c));
  };

  const setPrimary = (id: string) => {
    setContacts((prev) => prev.map((c) => ({ ...c, is_primary: c.id === id })));
  };

  const removeContact = async (id: string) => {
    const existing = contacts.find((c) => c.id === id);
    if (!existing) return;
    const hasSavedData = !id.startsWith("new-") || existing.name.trim() || existing.phone.trim();
    if (hasSavedData) {
      const ok = await confirm({
        title: "Remove emergency contact?",
        description: `${existing.name || "This contact"} will be removed from your emergency contacts. This can't be undone.`,
        confirmText: "Remove",
      });
      if (!ok) return;
    }
    setContacts((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (next.length && !next.some((c) => c.is_primary)) next[0].is_primary = true;
      return next;
    });
    if (!id.startsWith("new-")) {
      const { error } = await supabase.from("member_emergency_contacts").delete().eq("id", id);
      if (error) toast.error(error.message);
      else toast.success("Contact removed");
    }
  };

  const saveContacts = async () => {
    if (!user) return;
    // Only persist non-empty contacts (both name and phone required).
    const valid = contacts.filter((c) => c.name.trim() && c.phone.trim());
    if (valid.length === 0) {
      toast.error("Add at least one contact with a name and phone.");
      return;
    }
    // Enforce exactly one primary across the saved set (per club).
    const byClub = new Map<string, EmergencyContact[]>();
    for (const c of valid) {
      const arr = byClub.get(c.club_id) ?? [];
      arr.push(c);
      byClub.set(c.club_id, arr);
    }
    for (const [, arr] of byClub) {
      if (!arr.some((c) => c.is_primary)) arr[0].is_primary = true;
      let seen = false;
      for (const c of arr) {
        if (c.is_primary && !seen) { seen = true; continue; }
        if (c.is_primary && seen) c.is_primary = false;
      }
    }

    setSavingContacts(true);
    try {
      for (const c of valid) {
        const payload = {
          user_id: user.id, club_id: c.club_id,
          name: c.name.trim(), phone: c.phone.trim(),
          relationship: c.relationship?.trim() || null,
          email: c.email?.trim() || null,
          is_primary: c.is_primary,
        };
        if (c.id.startsWith("new-")) {
          const { error } = await supabase.from("member_emergency_contacts").insert(payload);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("member_emergency_contacts").update(payload).eq("id", c.id);
          if (error) throw error;
        }
      }
      toast.success("Emergency contacts saved");
      if (approvedClubIds.length > 0) {
        const { data } = await supabase.from("member_emergency_contacts")
          .select("id, club_id, name, phone, relationship, email, is_primary")
          .eq("user_id", user.id).in("club_id", approvedClubIds);
        setContacts((data as EmergencyContact[]) ?? []);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Couldn't save contacts";
      toast.error(message);
    } finally {
      setSavingContacts(false);
    }
  };

  const saveMedical = async () => {
    if (!user || !medical || !activeClubId) return;
    setSavingMedical(true);
    const payload = {
      user_id: user.id, club_id: activeClubId,
      allergies: medical.allergies.trim() || null,
      medications: medical.medications.trim() || null,
      notes: medical.notes.trim() || null,
    };
    if (medical.id) {
      const { error } = await supabase.from("member_medical_info").update(payload).eq("id", medical.id);
      if (error) { setSavingMedical(false); toast.error(error.message); return; }
    } else {
      const { data, error } = await supabase.from("member_medical_info").insert(payload).select("id").single();
      if (error) { setSavingMedical(false); toast.error(error.message); return; }
      setMedical({ ...medical, id: data.id });
    }
    setSavingMedical(false);
    toast.success("Medical info saved");
  };

  // Drag-and-drop helpers (native HTML5 DnD)
  const onDragStart = (key: SectionKey) => (e: React.DragEvent) => {
    setDragKey(key);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const onDrop = (target: SectionKey) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragKey || dragKey === target) { setDragKey(null); return; }
    const next = [...order];
    const from = next.indexOf(dragKey);
    const to = next.indexOf(target);
    next.splice(from, 1);
    next.splice(to, 0, dragKey);
    setOrder(next);
    setDragKey(null);
    persistOrder(next);
  };

  const sectionMeta: Record<SectionKey, { title: string; icon: React.ReactNode; subtitle?: string }> = useMemo(() => ({
    profile: { title: "Profile", icon: <User className="h-4 w-4 text-primary" /> },
    email: { title: "Email", icon: <Mail className="h-4 w-4 text-primary" /> },
    password: { title: "Password", icon: <KeyRound className="h-4 w-4 text-primary" /> },
    notifications: { title: "Notifications", icon: <Bell className="h-4 w-4 text-primary" /> },
    emergency: { title: "Emergency contacts", icon: <ShieldAlert className="h-4 w-4 text-destructive" /> },
    medical: {
      title: "Medical info",
      icon: <HeartPulse className="h-4 w-4 text-primary" />,
      subtitle: activeClub?.club.name,
    },
    clubs: { title: "Clubs", icon: <User className="h-4 w-4 text-primary" /> },
    locations: { title: "Saved locations", icon: <MapPin className="h-4 w-4 text-primary" /> },
  }), [activeClub?.club.name]);

  const renderSection = (key: SectionKey) => {
    const meta = sectionMeta[key];
    return (
      <Card
        key={key}
        className={`p-0 overflow-hidden transition-opacity ${dragKey === key ? "opacity-50" : ""}`}
        onDragOver={onDragOver}
        onDrop={onDrop(key)}
      >
        <Collapsible open={open[key]} onOpenChange={(v) => setOpen((p) => ({ ...p, [key]: v }))}>
          <div className="flex items-center gap-1 px-2 py-2">
            <button
              type="button"
              draggable
              onDragStart={onDragStart(key)}
              className="p-2 -ml-1 cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground"
              aria-label="Drag to reorder"
              title="Drag to reorder"
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <CollapsibleTrigger className="flex-1 flex items-center gap-2 py-2 pr-2 text-left">
              {meta.icon}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">
                  {meta.title}
                  {meta.subtitle && (
                    <span className="text-xs text-muted-foreground font-normal ml-1">
                      ({meta.subtitle})
                    </span>
                  )}
                </div>
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open[key] ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <div className="px-4 pb-4 pt-1">{renderBody(key)}</div>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    );
  };

  const renderBody = (key: SectionKey) => {
    switch (key) {
      case "profile":
        return (
          <form onSubmit={saveProfile} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            </div>
            <div className="space-y-1.5">
              <Label>Preferred roles</Label>
              <div className="grid grid-cols-3 gap-2">
                {ROLE_OPTIONS.map((r) => (
                  <Button
                    key={r.value}
                    type="button"
                    variant={preferredRoles.includes(r.value) ? "default" : "outline"}
                    onClick={() => toggleRole(r.value)}
                    className="h-10"
                  >
                    {r.label}
                  </Button>
                ))}
              </div>
            </div>
            <Button type="submit" disabled={savingProfile}>{savingProfile ? "Saving..." : "Save profile"}</Button>
          </form>
        );

      case "email":
        return (
          <form onSubmit={saveEmail} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">
                Changing your email sends a confirmation link to the new address.
              </p>
            </div>
            <Button type="submit" disabled={savingEmail || !email.trim() || email === user?.email}>
              {savingEmail ? "Updating…" : "Update email"}
            </Button>
          </form>
        );

      case "password":
        return (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (newPassword.length < 8) { toast.error("Password must be at least 8 characters."); return; }
              if (newPassword !== confirmPassword) { toast.error("Passwords don't match."); return; }
              setSavingPassword(true);
              try {
                const { error } = await supabase.auth.updateUser({ password: newPassword });
                if (error) throw error;
                setNewPassword(""); setConfirmPassword("");
                // Re-validate the session so the next sign-in uses the new password.
                await supabase.auth.refreshSession();
                toast.success("Password updated. Use your new password next time you sign in.");
              } catch (err: unknown) {
                const message = err instanceof Error ? err.message : "Couldn't update password";
                toast.error(message);
              } finally {
                setSavingPassword(false);
              }
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-pw">New password</Label>
              <Input id="new-pw" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-pw">Confirm new password</Label>
              <Input id="confirm-pw" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Minimum 8 characters. You'll stay signed in; the new password takes effect on your next sign-in.</p>
            </div>
            <Button type="submit" disabled={savingPassword || !newPassword || !confirmPassword}>
              {savingPassword ? "Updating…" : "Update password"}
            </Button>
          </form>
        );

      case "notifications":
        return (
          <div className="space-y-1">
            <PrefRow
              title="Session reminders"
              desc="Get reminded before sessions you've RSVP'd to."
              checked={prefs.notify_session_reminders}
              onChange={(v) => updatePref("notify_session_reminders", v)}
            />
            <PrefRow
              title="New sessions posted"
              desc="Let me know when a coach adds a new session in my club."
              checked={prefs.notify_new_sessions}
              onChange={(v) => updatePref("notify_new_sessions", v)}
            />
            <PrefRow
              title="Carpool updates"
              desc="My ride request accepted, driver changes plans, pickup confirmed."
              checked={prefs.notify_carpool_updates}
              onChange={(v) => updatePref("notify_carpool_updates", v)}
            />
            <PrefRow
              title="Equipment faults & packing lists"
              desc="A fault is logged on gear I use, or a packing list is assigned."
              checked={prefs.notify_equipment}
              onChange={(v) => updatePref("notify_equipment", v)}
            />
            {canManage && (
              <>
                <div className="pt-3 mt-2 border-t">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Coach &amp; admin</div>
                </div>
                <PrefRow
                  title="New join requests"
                  desc="A member requests to join the club."
                  checked={prefs.notify_join_requests}
                  onChange={(v) => updatePref("notify_join_requests", v)}
                />
                <PrefRow
                  title="Fault reports"
                  desc="A member reports a new equipment fault."
                  checked={prefs.notify_fault_reports}
                  onChange={(v) => updatePref("notify_fault_reports", v)}
                />
                <PrefRow
                  title="Pending carpool requests"
                  desc="Ride requests waiting to be assigned for upcoming sessions."
                  checked={prefs.notify_carpool_pending}
                  onChange={(v) => updatePref("notify_carpool_pending", v)}
                />
              </>
            )}
            <p className="text-[11px] text-muted-foreground pt-2">
              Preferences save automatically. Push delivery rolls out separately.
            </p>
          </div>
        );

      case "emergency":
        return (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">Used by coaches in case of an incident.</p>
              <Button type="button" variant="outline" size="sm" onClick={addContact} disabled={!activeClubId}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
            {contacts.length === 0 && (
              <p className="text-sm text-muted-foreground">No emergency contacts yet.</p>
            )}
            <div className="space-y-4">
              {contacts.map((c) => (
                <div key={c.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground truncate">
                      {memberships.find((m) => m.club_id === c.club_id)?.club.name ?? "Club"}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                        <input
                          type="radio"
                          name={`primary-${c.club_id}`}
                          checked={c.is_primary}
                          onChange={() => setPrimary(c.id)}
                          className="h-3.5 w-3.5 accent-primary"
                          aria-label="Set as primary contact"
                        />
                        Primary
                      </label>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeContact(c.id)} aria-label="Remove contact">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Input placeholder="Name" value={c.name} onChange={(e) => updateContact(c.id, { name: e.target.value })} />
                    <Input placeholder="Phone" type="tel" value={c.phone} onChange={(e) => updateContact(c.id, { phone: e.target.value })} />
                    <Input placeholder="Relationship" value={c.relationship ?? ""} onChange={(e) => updateContact(c.id, { relationship: e.target.value })} />
                    <Input placeholder="Email (optional)" type="email" value={c.email ?? ""} onChange={(e) => updateContact(c.id, { email: e.target.value })} />
                  </div>
                </div>
              ))}
            </div>
            {contacts.length > 0 && (
              <Button className="mt-3" onClick={saveContacts} disabled={savingContacts}>
                {savingContacts ? "Saving…" : "Save contacts"}
              </Button>
            )}
          </div>
        );

      case "medical":
        return medical ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="allergies">Allergies</Label>
              <Input id="allergies" value={medical.allergies} onChange={(e) => setMedical({ ...medical, allergies: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meds">Medications</Label>
              <Input id="meds" value={medical.medications} onChange={(e) => setMedical({ ...medical, medications: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={3} value={medical.notes} onChange={(e) => setMedical({ ...medical, notes: e.target.value })} />
            </div>
            <Button onClick={saveMedical} disabled={savingMedical}>
              {savingMedical ? "Saving…" : "Save medical info"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Join a club to add medical info.</p>
        );

      case "clubs":
        return (
          <div>
            <div className="space-y-2">
              {memberships.map((m) => (
                <div key={m.club_id} className="flex items-center justify-between rounded-lg border p-2.5">
                  <div className="min-w-0">
                    <div className="font-medium truncate text-sm">{m.club.name}</div>
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {m.roles.map((r) => (
                        <Badge key={r} variant="secondary" className="text-[10px] uppercase">{r.replace("_", " ")}</Badge>
                      ))}
                      {m.status !== "approved" && (
                        <Badge variant="outline" className="text-[10px] uppercase">{m.status}</Badge>
                      )}
                    </div>
                  </div>
                  {activeClub?.club_id === m.club_id && <Badge className="bg-accent text-accent-foreground">Active</Badge>}
                </div>
              ))}
            </div>
            <Button variant="outline" className="w-full mt-3" onClick={() => navigate({ to: "/onboarding" })}>
              Join or create another club
            </Button>
          </div>
        );

      case "locations":
        return <LocationsSection />;
    }
  };

  const isClubAdmin = activeClub?.roles.some((r) => r === "owner" || r === "club_admin") ?? false;
  const showRolesLink = isClubAdmin || isPlatformOwner;


  return (
    <AppShell>
      <h1 className="text-2xl font-bold mb-1">Settings</h1>
      <p className="text-xs text-muted-foreground mb-4">
        Tap a section to expand. Drag <GripVertical className="inline h-3 w-3" /> to reorder — your layout is saved.
      </p>

      {showRolesLink && (
        <Card className="p-3 mb-3">
          <button
            type="button"
            onClick={() => navigate({ to: "/settings/roles" })}
            className="flex w-full items-center gap-3 text-left"
          >
            <ShieldAlert className="h-4 w-4 text-primary" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">Roles & Permissions</div>
              <div className="text-xs text-muted-foreground">
                Assign club admins and coaches, and configure what coaches can do.
              </div>
            </div>
            <ChevronDown className="h-4 w-4 -rotate-90 text-muted-foreground" />
          </button>
        </Card>
      )}

      {canManage && (
        <Card className="p-3 mb-3">
          <button
            type="button"
            onClick={() => navigate({ to: "/settings/templates" })}
            className="flex w-full items-center gap-3 text-left"
          >
            <ShieldAlert className="h-4 w-4 text-primary" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">Templates</div>
              <div className="text-xs text-muted-foreground">
                Saved carpool setups, surveys, training plans and drills.
              </div>
            </div>
            <ChevronDown className="h-4 w-4 -rotate-90 text-muted-foreground" />
          </button>
        </Card>
      )}

      <div className="space-y-3">
        {order.map((key) => renderSection(key))}
      </div>

      <SignOutButton onConfirm={signOut} />
    </AppShell>
  );
}


function SignOutButton({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="w-full mt-10 text-destructive border-destructive/30 hover:bg-destructive/10">
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sign out?</AlertDialogTitle>
          <AlertDialogDescription>
            You'll need to log in again to access your clubs and sessions.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => { setOpen(false); onConfirm(); }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Sign out
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PrefRow({ title, desc, checked, onChange }: {
  title: string; desc: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3 py-2.5 cursor-pointer">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
