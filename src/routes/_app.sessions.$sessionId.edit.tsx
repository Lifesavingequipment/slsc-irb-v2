import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useClub, useCanManage } from "@/lib/club-context";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { DateTimeFields } from "@/components/ui/date-time-fields";
import { CarpoolEditor, validateCarpoolDrafts, emptyCarpoolDraft, type CarpoolDraft } from "@/components/session/CarpoolEditor";
import { CoachSetupSection, type VehicleDraft, type ExistingVehicle } from "@/components/session/CoachSetupSection";
import { invalidateSessionsCache } from "./_app.sessions.index";

export const Route = createFileRoute("/_app/sessions/$sessionId/edit")({
  head: () => ({ meta: [{ title: "Edit session — IRB Coaching" }] }),
  component: EditSession,
});

const schema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters").max(120),
  session_type: z.enum(["training", "fitness", "theory", "other"]),
  format: z.enum(["team", "individual"]),
  repeat_frequency: z.enum(["none", "daily", "weekly", "fortnightly", "monthly"]),
  location_id: z.string().uuid().optional(),
  location: z.string().trim().max(200).optional(),
  starts_at: z.string().min(1, "Start time is required"),
  ends_at: z.string().optional(),
  rsvp_deadline: z.string().optional(),
  capacity: z.number().int().min(1).max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
  survey_enabled: z.boolean(),
  carpool_enabled: z.boolean(),
}).superRefine((d, ctx) => {
  const s = new Date(d.starts_at).getTime();
  if (Number.isNaN(s)) {
    ctx.addIssue({ code: "custom", path: ["starts_at"], message: "Invalid start date/time" });
    return;
  }
  if (d.ends_at) {
    const e = new Date(d.ends_at).getTime();
    if (Number.isNaN(e)) ctx.addIssue({ code: "custom", path: ["ends_at"], message: "Invalid end date/time" });
    else if (e <= s) ctx.addIssue({ code: "custom", path: ["ends_at"], message: "End time must be after start time" });
  }
  if (d.rsvp_deadline) {
    const r = new Date(d.rsvp_deadline).getTime();
    if (Number.isNaN(r)) ctx.addIssue({ code: "custom", path: ["rsvp_deadline"], message: "Invalid RSVP deadline" });
    else if (r > s) ctx.addIssue({ code: "custom", path: ["rsvp_deadline"], message: "RSVP deadline must be on or before the session start" });
  }
});

type Loc = { id: string; name: string; address: string | null };

// Convert ISO timestamp -> value usable by <input type="datetime-local">
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EditSession() {
  const { sessionId } = Route.useParams();
  const { user } = useAuth();
  const { activeClub } = useClub();
  const canManage = useCanManage();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"training" | "fitness" | "theory" | "other">("training");
  const [format, setFormat] = useState<"team" | "individual">("team");
  const [repeat, setRepeat] = useState<"none" | "daily" | "weekly" | "fortnightly" | "monthly">("none");
  const [locations, setLocations] = useState<Loc[]>([]);
  const [locationId, setLocationId] = useState<string>("custom");
  const [customLocation, setCustomLocation] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [rsvpDeadline, setRsvpDeadline] = useState("");
  const [capacity, setCapacity] = useState("");
  const [notes, setNotes] = useState("");
  const [survey, setSurvey] = useState(false);
  const [carpool, setCarpool] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [clubId, setClubId] = useState<string | null>(null);
  const [carpools, setCarpools] = useState<CarpoolDraft[]>([]);
  const [originalCarpoolIds, setOriginalCarpoolIds] = useState<string[]>([]);
  const [pickups, setPickups] = useState<string[]>([]);
  const [trailers, setTrailers] = useState(0);
  const [existingVehicles, setExistingVehicles] = useState<ExistingVehicle[]>([]);
  const [vehiclesToDelete, setVehiclesToDelete] = useState<string[]>([]);
  const [pendingVehicles, setPendingVehicles] = useState<VehicleDraft[]>([]);
  const [newVehicle, setNewVehicle] = useState<VehicleDraft>({ name: "", seats: 8, pickup: "", can_tow: false });
  const [savedLocations, setSavedLocations] = useState<{ id: string; name: string; address: string | null }[]>([]);
  const [carpoolTemplates, setCarpoolTemplates] = useState<{ id: string; name: string; vehicles: { vehicle_name: string; available_seats: number; can_tow_trailer: boolean }[] }[]>([]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("sessions").select("*").eq("id", sessionId).maybeSingle();
      if (error || !data) { toast.error("Session not found"); navigate({ to: "/sessions" }); return; }
      setTitle(data.title);
      setType(data.session_type as typeof type);
      setFormat(data.format as typeof format);
      setRepeat((data.repeat_frequency ?? "none") as typeof repeat);
      setStartsAt(toLocalInput(data.starts_at));
      setEndsAt(toLocalInput(data.ends_at));
      setRsvpDeadline(toLocalInput(data.rsvp_deadline));
      setCapacity(data.capacity ? String(data.capacity) : "");
      setNotes(data.notes ?? "");
      setSurvey(!!data.survey_enabled);
      setCarpool(!!data.carpool_enabled);
      setClubId(data.club_id);
      setLocationId(data.location_id ?? "custom");
      setCustomLocation(data.location_id ? "" : (data.location ?? ""));
      setPickups([...(data.carpool_pickups ?? []), ""]);
      setTrailers(data.trailers_required ?? 0);

      const [locsRes, carpoolTplRes] = await Promise.all([
        supabase.from("locations").select("id, name, address").eq("club_id", data.club_id).order("name"),
        supabase.from("carpool_templates").select("id, name, vehicles").eq("club_id", data.club_id).order("name"),
      ]);
      setLocations((locsRes.data ?? []) as Loc[]);
      setSavedLocations((locsRes.data ?? []) as { id: string; name: string; address: string | null }[]);
      setCarpoolTemplates((carpoolTplRes.data ?? []) as typeof carpoolTemplates);

      const { data: cvs } = await supabase
        .from("session_club_vehicles")
        .select("id, name, seats, pickup_location, can_tow")
        .eq("session_id", sessionId)
        .order("created_at");
      setExistingVehicles((cvs ?? []).map((v) => ({
        id: v.id,
        name: v.name,
        seats: v.seats,
        pickup_location: v.pickup_location,
        can_tow: v.can_tow,
      })));

      const { data: cps } = await supabase
        .from("carpools")
        .select("id, driver_user_id, vehicle_name, departure_location, departure_time, available_seats, notes, can_tow_trailer")
        .eq("session_id", sessionId);
      const drafts: CarpoolDraft[] = (cps ?? []).map((c) => ({
        id: c.id,
        driver_user_id: c.driver_user_id,
        vehicle_name: c.vehicle_name,
        departure_location: c.departure_location,
        departure_time: toLocalInput(c.departure_time),
        available_seats: c.available_seats,
        notes: c.notes ?? "",
        can_tow_trailer: c.can_tow_trailer,
      }));
      setCarpools(drafts);
      setOriginalCarpoolIds(drafts.map((d) => d.id!).filter(Boolean));
      setLoading(false);
    })();
  }, [sessionId, navigate]);

  if (!canManage) {
    return (
      <AppShell>
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Only coaches and admins can edit sessions.
        </Card>
      </AppShell>
    );
  }

  if (loading) {
    return <AppShell><div className="py-12 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const usingSaved = locationId !== "custom" && locationId !== "";
    const savedLoc = usingSaved ? locations.find((l) => l.id === locationId) : null;
    const locationText = usingSaved
      ? (savedLoc ? [savedLoc.name, savedLoc.address].filter(Boolean).join(" — ") : "")
      : customLocation;

    const parsed = schema.safeParse({
      title, session_type: type, format, repeat_frequency: repeat,
      location_id: usingSaved ? locationId : undefined,
      location: locationText || undefined,
      starts_at: startsAt,
      ends_at: endsAt || undefined,
      rsvp_deadline: rsvpDeadline || undefined,
      capacity: capacity ? Number(capacity) : undefined,
      notes,
      survey_enabled: survey,
      carpool_enabled: carpool,
    });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setErrors({});

    const effectiveCarpools = carpool ? carpools : [];
    if (effectiveCarpools.length > 0) {
      const err = validateCarpoolDrafts(effectiveCarpools);
      if (err) { toast.error(err); return; }
    }

    setBusy(true);
    const cleanPickups = carpool ? pickups.map((p) => p.trim()).filter(Boolean) : [];

    const { error } = await supabase.from("sessions").update({
      title: parsed.data.title,
      session_type: parsed.data.session_type,
      format: parsed.data.format,
      repeat_frequency: parsed.data.repeat_frequency,
      location: parsed.data.location || null,
      location_id: parsed.data.location_id ?? null,
      starts_at: new Date(parsed.data.starts_at).toISOString(),
      ends_at: parsed.data.ends_at ? new Date(parsed.data.ends_at).toISOString() : null,
      rsvp_deadline: parsed.data.rsvp_deadline ? new Date(parsed.data.rsvp_deadline).toISOString() : null,
      capacity: parsed.data.capacity ?? null,
      notes: parsed.data.notes || null,
      survey_enabled: parsed.data.survey_enabled,
      carpool_enabled: parsed.data.carpool_enabled,
      carpool_pickups: cleanPickups.length > 0 ? cleanPickups : null,
      trailers_required: carpool ? trailers : null,
    }).eq("id", sessionId);
    if (error) { setBusy(false); toast.error(error.message); return; }

    // Sync carpool rows: update existing, insert new, delete removed.
    const keptIds = new Set(effectiveCarpools.filter((c) => c.id).map((c) => c.id!));
    const toDelete = originalCarpoolIds.filter((id) => !keptIds.has(id));
    const targetClubId = clubId ?? activeClub?.club_id;
    if (toDelete.length > 0) {
      const { error: delErr } = await supabase.from("carpools").delete().in("id", toDelete);
      if (delErr) { setBusy(false); toast.error(`Couldn't remove vehicles: ${delErr.message}`); return; }
    }
    for (const c of effectiveCarpools) {
      const payload = {
        vehicle_name: c.vehicle_name.trim(),
        departure_location: c.departure_location.trim(),
        departure_time: new Date(c.departure_time).toISOString(),
        available_seats: c.available_seats,
        notes: c.notes.trim() || null,
        can_tow_trailer: c.can_tow_trailer,
      };
      if (c.id) {
        const { error: upErr } = await supabase.from("carpools").update(payload).eq("id", c.id);
        if (upErr) { setBusy(false); toast.error(`Couldn't update vehicle: ${upErr.message}`); return; }
      } else if (targetClubId) {
        const { error: insErr } = await supabase.from("carpools").insert({
          ...payload,
          session_id: sessionId,
          club_id: targetClubId,
          driver_user_id: c.driver_user_id,
        });
        if (insErr) { setBusy(false); toast.error(`Couldn't add vehicle: ${insErr.message}`); return; }
      }
    }

    // Club vehicles: delete removed, insert pending new ones.
    if (vehiclesToDelete.length > 0) {
      const { error: vDelErr } = await supabase
        .from("session_club_vehicles").delete().in("id", vehiclesToDelete);
      if (vDelErr) { setBusy(false); toast.error(`Couldn't remove vehicles: ${vDelErr.message}`); return; }
    }
    const newVehicleRows = pendingVehicles.filter((v) => v.name.trim());
    if (newVehicleRows.length > 0 && targetClubId) {
      const { error: vInsErr } = await supabase.from("session_club_vehicles").insert(
        newVehicleRows.map((v) => ({
          session_id: sessionId,
          club_id: targetClubId,
          name: v.name.trim(),
          seats: v.seats,
          pickup_location: v.pickup.trim() || null,
          can_tow: v.can_tow,
        })),
      );
      if (vInsErr) { setBusy(false); toast.error(`Couldn't add vehicles: ${vInsErr.message}`); return; }
    }

    setBusy(false);
    invalidateSessionsCache(targetClubId);
    toast.success("Session updated");
    navigate({ to: "/sessions/$sessionId", params: { sessionId } });
  };

  const addLocation = async () => {
    const targetClub = clubId ?? activeClub?.club_id;
    if (!targetClub) return;
    const name = prompt("Location name (e.g. North Beach)")?.trim();
    if (!name) return;
    const address = prompt("Address (optional)")?.trim() || null;
    const { data, error } = await supabase.from("locations")
      .insert({ club_id: targetClub, name, address, created_by: user?.id ?? null })
      .select("id, name, address")
      .single();
    if (error) { toast.error(error.message); return; }
    setLocations((prev) => [...prev, data as Loc].sort((a, b) => a.name.localeCompare(b.name)));
    setLocationId(data!.id);
    toast.success("Location saved");
  };

  return (
    <AppShell>
      <Link to="/sessions/$sessionId" params={{ sessionId }} className="inline-flex items-center text-sm text-muted-foreground mb-2">
        <ChevronLeft className="h-4 w-4" /> Session
      </Link>
      <h1 className="text-2xl font-bold mb-4">Edit session</h1>
      <Card className="p-4">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={!!errors.title || undefined}
              className={errors.title ? "border-destructive" : undefined}
            />
            {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
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
              <Label>Format</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as typeof format)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="team">Team</SelectItem>
                  <SelectItem value="individual">Individual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Location</Label>
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
              <DateTimeFields id="starts" required value={startsAt} onChange={setStartsAt} invalid={!!errors.starts_at} />
              {errors.starts_at && <p className="text-xs text-destructive">{errors.starts_at}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ends">Ends</Label>
              <DateTimeFields id="ends" value={endsAt} onChange={setEndsAt} invalid={!!errors.ends_at} />
              {errors.ends_at && <p className="text-xs text-destructive">{errors.ends_at}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rsvp">RSVP deadline</Label>
            <DateTimeFields id="rsvp" value={rsvpDeadline} onChange={setRsvpDeadline} invalid={!!errors.rsvp_deadline} />
            {errors.rsvp_deadline && <p className="text-xs text-destructive">{errors.rsvp_deadline}</p>}
            <p className="text-xs text-muted-foreground">After this time, members can't change their response. Times use 24-hour format.</p>
          </div>

          <div className="space-y-1.5">
            <Label>Repeat</Label>
            <Select value={repeat} onValueChange={(v) => setRepeat(v as typeof repeat)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Doesn't repeat</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="fortnightly">Fortnightly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cap">Capacity</Label>
            <Input id="cap" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Optional" />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Pre-training survey</div>
              <p className="text-xs text-muted-foreground">Members must answer the survey before they can RSVP. Manage questions on the session page.</p>
            </div>
            <Switch checked={survey} onCheckedChange={setSurvey} />
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Carpool</div>
                <p className="text-xs text-muted-foreground">Let members coordinate rides. Add, edit or remove vehicles below.</p>
              </div>
              <Switch
                checked={carpool}
                onCheckedChange={(v) => {
                  setCarpool(v);
                  if (v && carpools.length === 0 && user) {
                    setCarpools([emptyCarpoolDraft(user.id, startsAt)]);
                  }
                  if (v && pickups.length === 0) setPickups([""]);
                }}
              />
            </div>
            {carpool && carpoolTemplates.length > 0 && (
              <Select onValueChange={(id) => {
                const tpl = carpoolTemplates.find((t) => t.id === id);
                if (tpl) setPendingVehicles(tpl.vehicles.map((v) => ({
                  name: v.vehicle_name ?? "",
                  seats: v.available_seats ?? 4,
                  pickup: "",
                  can_tow: v.can_tow_trailer ?? false,
                })));
              }}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Load saved carpool setup…" />
                </SelectTrigger>
                <SelectContent>
                  {carpoolTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {carpool && user && (
              <CarpoolEditor
                clubId={clubId ?? activeClub?.club_id ?? null}
                currentUserId={user.id}
                canPickAnyDriver={canManage}
                value={carpools}
                onChange={setCarpools}
                defaultDeparture={startsAt}
                savedLocations={savedLocations}
              />
            )}
            {carpool && (
              <CoachSetupSection
                pickups={pickups}
                onPickupsChange={setPickups}
                trailers={trailers}
                onTrailersChange={setTrailers}
                savedLocations={savedLocations}
                existingVehicles={existingVehicles.filter((v) => !vehiclesToDelete.includes(v.id))}
                onRemoveExisting={(id) => setVehiclesToDelete((prev) => [...prev, id])}
                pendingVehicles={pendingVehicles}
                onRemovePending={(i) => setPendingVehicles((v) => v.filter((_, idx) => idx !== i))}
                newVehicle={newVehicle}
                onNewVehicleChange={setNewVehicle}
                onAddVehicle={() => {
                  if (!newVehicle.name.trim()) return;
                  setPendingVehicles((v) => [...v, newVehicle]);
                  setNewVehicle({ name: "", seats: 8, pickup: "", can_tow: false });
                }}
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1 h-11"
              onClick={() => navigate({ to: "/sessions/$sessionId", params: { sessionId } })}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="flex-1 h-11">
              {busy ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </Card>
    </AppShell>
  );
}
