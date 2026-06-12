import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useClub } from "@/lib/club-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Waves, LogOut, CalendarPlus, MapPin, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { DateTimePicker } from "@/components/ui/datetime-picker";

export const Route = createFileRoute("/_app/onboarding/coach")({
  head: () => ({ meta: [{ title: "Set up your first session — IRB Coaching" }] }),
  component: CoachOnboarding,
});

const STASH_KEY = "pending_coach_onboarding_club";

type Loc = { id: string; name: string; address: string | null };

const schema = z.object({
  title: z.string().trim().min(2, "Give it a title").max(120),
  session_type: z.enum(["training", "fitness", "theory", "other"]),
  location_id: z.string().uuid().optional(),
  location: z.string().trim().max(200).optional(),
  starts_at: z.string().min(1, "Pick a start time"),
  ends_at: z.string().optional(),
  notes: z.string().trim().max(1000).optional(),
});

function CoachOnboarding() {
  const { user, signOut } = useAuth();
  const { memberships, activeClub, setActiveClubId, loading } = useClub();
  const navigate = useNavigate();

  const [clubId, setClubId] = useState<string | null>(null);
  const [locations, setLocations] = useState<Loc[]>([]);
  const [busy, setBusy] = useState(false);

  // form state
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"training" | "fitness" | "theory" | "other">("training");
  const [locationId, setLocationId] = useState<string>("custom");
  const [customLocation, setCustomLocation] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [notes, setNotes] = useState("");

  // Resolve which club this onboarding is for: stashed id from invite redemption,
  // otherwise the active club.
  useEffect(() => {
    if (loading) return;
    const stashed = typeof window !== "undefined" ? sessionStorage.getItem(STASH_KEY) : null;
    const approved = memberships.filter((m) => m.status === "approved");
    const target =
      (stashed && approved.find((m) => m.club_id === stashed)?.club_id) ||
      activeClub?.club_id ||
      approved[0]?.club_id ||
      null;
    if (!target) { navigate({ to: "/onboarding", replace: true }); return; }
    setClubId(target);
    if (activeClub?.club_id !== target) setActiveClubId(target);
  }, [loading, memberships, activeClub?.club_id, navigate, setActiveClubId]);

  useEffect(() => {
    if (!clubId) return;
    supabase
      .from("locations")
      .select("id, name, address")
      .eq("club_id", clubId)
      .order("name")
      .then(({ data }) => {
        const list = (data ?? []) as Loc[];
        setLocations(list);
        if (list.length > 0) setLocationId(list[0].id);
      });
  }, [clubId]);

  const clearStash = () => {
    if (typeof window !== "undefined") sessionStorage.removeItem(STASH_KEY);
  };

  const skip = () => {
    clearStash();
    navigate({ to: "/dashboard", replace: true });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !clubId) return;

    const usingSaved = locationId !== "custom" && locationId !== "";
    const savedLoc = usingSaved ? locations.find((l) => l.id === locationId) : null;
    const locationText = usingSaved
      ? (savedLoc ? [savedLoc.name, savedLoc.address].filter(Boolean).join(" — ") : "")
      : customLocation;

    const parsed = schema.safeParse({
      title, session_type: type,
      location_id: usingSaved ? locationId : undefined,
      location: locationText || undefined,
      starts_at: startsAt,
      ends_at: endsAt || undefined,
      notes,
    });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }

    setBusy(true);
    const { error } = await supabase.from("sessions").insert({
      club_id: clubId,
      title: parsed.data.title,
      session_type: parsed.data.session_type,
      location: parsed.data.location || null,
      location_id: parsed.data.location_id ?? null,
      starts_at: new Date(parsed.data.starts_at).toISOString(),
      ends_at: parsed.data.ends_at ? new Date(parsed.data.ends_at).toISOString() : null,
      notes: parsed.data.notes || null,
      created_by: user.id,
    });
    setBusy(false);
    if (error) {
      // Coach role might not yet be granted — RLS will block. Surface a friendly message.
      toast.error(
        error.message.toLowerCase().includes("row-level")
          ? "Only coaches and admins can create sessions. Ask the owner to promote you, then try again."
          : error.message,
      );
      return;
    }
    toast.success("First session scheduled.");
    clearStash();
    navigate({ to: "/dashboard", replace: true });
  };

  const addLocation = async () => {
    if (!clubId) return;
    const name = prompt("Location name (e.g. Miami Pool)")?.trim();
    if (!name) return;
    const address = prompt("Address (optional)")?.trim() || null;
    const { data, error } = await supabase.from("locations")
      .insert({ club_id: clubId, name, address, created_by: user?.id ?? null })
      .select("id, name, address")
      .single();
    if (error) { toast.error(error.message); return; }
    setLocations((prev) => [...prev, data as Loc].sort((a, b) => a.name.localeCompare(b.name)));
    setLocationId(data!.id);
    toast.success("Location saved");
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
        <h1 className="mt-8 text-2xl font-bold">Schedule your first session</h1>
        <p className="mt-1 text-sm opacity-90">
          Get the club rolling with the basics — title, where, and when. You can flesh it out later.
        </p>
      </div>

      <form onSubmit={onSubmit} className="px-4 -mt-6 max-w-2xl mx-auto pb-10 space-y-4">
        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Session basics</h2>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Saturday IRB training" />
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="training">Training</SelectItem>
                <SelectItem value="fitness">Fitness</SelectItem>
                <SelectItem value="theory">Theory</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Location</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger><SelectValue placeholder="Choose location" /></SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}{l.address ? ` — ${l.address}` : ""}</SelectItem>
                ))}
                <SelectItem value="custom">Custom address…</SelectItem>
              </SelectContent>
            </Select>
            {locationId === "custom" ? (
              <Input
                value={customLocation}
                onChange={(e) => setCustomLocation(e.target.value)}
                placeholder="Type address or place name"
              />
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={addLocation} className="h-7 px-2 text-xs">
                + Save a new location
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="starts">Starts</Label>
              <DateTimePicker id="starts" required value={startsAt} onChange={setStartsAt} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ends">Ends</Label>
              <DateTimePicker id="ends" value={endsAt} onChange={setEndsAt} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Focus, gear, what to bring…" />
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="ghost" onClick={skip} className="h-11">
            <SkipForward className="h-4 w-4 mr-1.5" /> Skip for now
          </Button>
          <Button type="submit" disabled={busy} className="h-11">
            {busy ? "Saving…" : "Save & continue"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Don't see a "create session" option later? Ask the club owner to promote you to coach.
        </p>
      </form>
    </div>
  );
}
