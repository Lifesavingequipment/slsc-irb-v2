import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Waves, ChevronLeft, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/onboarding/profile")({
  head: () => ({ meta: [{ title: "Complete your profile — IRB Coaching" }] }),
  component: PendingProfile,
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

const schema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(80),
  last_name: z.string().trim().min(1, "Last name is required").max(80),
  phone: z.string().trim().max(40).or(z.literal("")),
  date_of_birth: z.string().max(10).or(z.literal("")),
});

function PendingProfile() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [ageDivision, setAgeDivision] = useState<AgeDivision | "">("");
  const [preferredRoles, setPreferredRoles] = useState<string[]>([]);
  const [nationality, setNationality] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [pRes, idRes] = await Promise.all([
        supabase.from("profiles")
          .select("first_name, last_name, full_name, phone, gender, age_division, preferred_roles, nationality")
          .eq("id", user.id).maybeSingle(),
        supabase.from("profile_identity")
          .select("date_of_birth").eq("user_id", user.id).maybeSingle(),
      ]);
      const p = (pRes.data ?? {}) as Record<string, unknown>;
      const idRow = (idRes.data ?? {}) as Record<string, unknown>;
      const fn = (p.first_name as string) ?? "";
      const ln = (p.last_name as string) ?? "";
      const full = (p.full_name as string) ?? "";
      if (fn || ln) { setFirstName(fn); setLastName(ln); }
      else if (full) {
        const parts = full.split(/\s+/);
        setFirstName(parts[0] ?? "");
        setLastName(parts.slice(1).join(" "));
      }
      setPhone((p.phone as string) ?? "");
      setDob((idRow.date_of_birth as string) ?? "");
      setGender((p.gender as string) ?? "");
      setAgeDivision(((p.age_division as AgeDivision) ?? "") as AgeDivision | "");
      setPreferredRoles((p.preferred_roles as string[]) ?? []);
      setNationality((p.nationality as string) ?? "");
      setLoading(false);
    })();
  }, [user]);

  const toggleRole = (role: string) =>
    setPreferredRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = schema.safeParse({
      first_name: firstName, last_name: lastName, phone, date_of_birth: dob,
    });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setBusy(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const { error: pErr } = await supabase.from("profiles").upsert({
        id: user.id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        full_name: fullName,
        phone: phone.trim() || null,
        gender: gender || null,
        age_division: (ageDivision || null) as AgeDivision | null,
        preferred_roles: preferredRoles,
        nationality: nationality.trim() || null,
      }, { onConflict: "id" });
      if (pErr) throw pErr;

      const { error: idErr } = await supabase.from("profile_identity").upsert({
        user_id: user.id,
        date_of_birth: dob || null,
      }, { onConflict: "user_id" });
      if (idErr) throw idErr;

      toast.success("Profile saved");
      navigate({ to: "/onboarding", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-surf-gradient text-primary-foreground safe-top px-6 pt-10 pb-12">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/15 flex items-center justify-center">
            <Waves className="h-5 w-5" />
          </div>
          <div className="font-semibold">IRB Coaching</div>
        </div>
        <h1 className="mt-8 text-2xl font-bold">Finish your profile</h1>
        <p className="mt-1 text-sm opacity-90">
          Fill this in while you wait for approval — you'll be ready to go the moment an admin lets you in.
        </p>
      </div>

      <div className="px-4 -mt-6 max-w-2xl mx-auto pb-10">
        <Link to="/onboarding" className="inline-flex items-center text-sm text-muted-foreground mb-2">
          <ChevronLeft className="h-4 w-4" /> Back
        </Link>
        <form onSubmit={onSubmit} className="space-y-4">
          <Card className="p-4">
            <div className="text-sm font-semibold mb-3">About you</div>
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
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
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
              <div className="space-y-1.5">
                <Label htmlFor="nationality">Nationality</Label>
                <Input id="nationality" value={nationality} onChange={(e) => setNationality(e.target.value)} />
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

          <Button type="submit" disabled={busy} className="w-full h-11">
            <Save className="h-4 w-4 mr-1.5" />
            {busy ? "Saving…" : "Save profile"}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            You can add emergency contacts and medical info once your club approves you.
          </p>
        </form>
      </div>
    </div>
  );
}
