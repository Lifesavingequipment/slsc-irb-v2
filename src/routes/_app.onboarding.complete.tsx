import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useClub } from "@/lib/club-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Waves, LogOut, ShieldAlert, HeartPulse } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/onboarding/complete")({
  head: () => ({ meta: [{ title: "Complete your profile — IRB Coaching" }] }),
  component: CompleteProfile,
});

const ecSchema = z.object({
  name: z.string().trim().min(2, "Emergency contact name required").max(80),
  phone: z.string().trim().min(5, "Emergency contact phone required").max(30),
  relationship: z.string().trim().max(60).optional(),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
});

function CompleteProfile() {
  const { user, signOut } = useAuth();
  const { memberships, loading } = useClub();
  const navigate = useNavigate();

  const approvedClubs = useMemo(
    () => memberships.filter((m) => m.status === "approved").map((m) => m.club_id),
    [memberships],
  );

  const [ecName, setEcName] = useState("");
  const [ecPhone, setEcPhone] = useState("");
  const [ecRel, setEcRel] = useState("");
  const [ecEmail, setEcEmail] = useState("");
  const [allergies, setAllergies] = useState("");
  const [medications, setMedications] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && approvedClubs.length === 0) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [loading, approvedClubs.length, navigate]);

  const onSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault?.();
    if (busy) return;
    if (!user) return;
    if (approvedClubs.length === 0) {
      toast.error("You're not in a club yet — let's set that up first.");
      navigate({ to: "/onboarding", replace: true });
      return;
    }
    const parsed = ecSchema.safeParse({
      name: ecName, phone: ecPhone, relationship: ecRel, email: ecEmail,
    });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }

    setBusy(true);
    try {
      const ecRows = approvedClubs.map((club_id) => ({
        user_id: user.id, club_id,
        name: parsed.data.name,
        phone: parsed.data.phone,
        relationship: parsed.data.relationship || null,
        email: parsed.data.email || null,
        is_primary: true,
      }));
      const { error: ecErr } = await supabase.from("member_emergency_contacts").insert(ecRows);
      if (ecErr) throw ecErr;

      const hasMedical = allergies || medications || notes;
      if (hasMedical) {
        const miRows = approvedClubs.map((club_id) => ({
          user_id: user.id, club_id,
          allergies: allergies || null,
          medications: medications || null,
          notes: notes || null,
        }));
        const { error: miErr } = await supabase.from("member_medical_info").insert(miRows);
        if (miErr) throw miErr;
      }

      toast.success("Profile complete — taking you in.");
      const pendingCoach =
        typeof window !== "undefined" && sessionStorage.getItem("pending_coach_onboarding_club");
      const dest = pendingCoach ? "/onboarding/coach" : "/dashboard";
      // Force a full reload so _app re-checks emergency contacts (its cached
      // needsEc=true would otherwise immediately redirect us back here).
      if (typeof window !== "undefined") {
        window.location.assign(dest);
      } else {
        await navigate({ to: dest, replace: true });
      }
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not save your profile";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-surf-gradient text-primary-foreground safe-top px-6 pt-10 pb-12">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/15 flex items-center justify-center">
              <Waves className="h-5 w-5" />
            </div>
            <div className="font-semibold">IRB Coaching</div>
          </div>
          <button onClick={signOut} className="text-sm opacity-80 hover:opacity-100 flex items-center gap-1.5">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
        <h1 className="mt-8 text-2xl font-bold">Complete your profile</h1>
        <p className="mt-1 text-sm opacity-90">We need an emergency contact before you can join sessions.</p>
      </div>

      <form onSubmit={onSubmit} className="px-4 -mt-6 max-w-2xl mx-auto pb-10 space-y-4">
        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-destructive" />
            <h2 className="font-semibold">Emergency contact <span className="text-destructive">*</span></h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ec-name">Name</Label>
              <Input id="ec-name" required value={ecName} onChange={(e) => setEcName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec-phone">Phone</Label>
              <Input id="ec-phone" type="tel" required value={ecPhone} onChange={(e) => setEcPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec-rel">Relationship</Label>
              <Input id="ec-rel" placeholder="Partner, parent…" value={ecRel} onChange={(e) => setEcRel(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec-email">Email (optional)</Label>
              <Input id="ec-email" type="email" value={ecEmail} onChange={(e) => setEcEmail(e.target.value)} />
            </div>
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Medical info <span className="text-xs text-muted-foreground font-normal">(optional)</span></h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="allergies">Allergies</Label>
              <Input id="allergies" value={allergies} onChange={(e) => setAllergies(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="meds">Medications</Label>
              <Input id="meds" value={medications} onChange={(e) => setMedications(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        </Card>

        <Button type="submit" className="w-full h-12 text-base" disabled={busy}>
          {busy ? "Saving…" : "Save and continue"}
        </Button>
      </form>
    </div>
  );
}
