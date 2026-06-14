import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DateTimeFields } from "@/components/ui/date-time-fields";
import { CarpoolEditor, validateCarpoolDrafts, emptyCarpoolDraft, type CarpoolDraft } from "@/components/session/CarpoolEditor";
import { CoachSetupSection, type VehicleDraft } from "@/components/session/CoachSetupSection";
import { invalidateSessionsCache } from "./_app.sessions.index";
import { addDays, addMonths, addWeeks, format as fmt } from "date-fns";
import { notifyAllClubMembers } from "@/lib/notify";
import { Badge } from "@/components/ui/badge";

type QType = "yes_no" | "text" | "single_choice";
type DraftQ = { question_text: string; question_type: QType; options: string[]; required: boolean };
const TYPE_LABEL: Record<QType, string> = { yes_no: "Yes / No", text: "Short answer", single_choice: "Choose one" };
const emptyQ = (): DraftQ => ({ question_text: "", question_type: "yes_no", options: [], required: true });

function generateOccurrences(startISO: string, endISO: string | null, freq: string, until: string | null): { startsAt: string; endsAt: string | null }[] {
  if (freq === "none" || !until) return [{ startsAt: startISO, endsAt: endISO }];
  const start = new Date(startISO);
  const end = endISO ? new Date(endISO) : null;
  const stopDate = new Date(until);
  stopDate.setHours(23, 59, 59, 999);
  const step = (d: Date) => {
    if (freq === "daily") return addDays(d, 1);
    if (freq === "weekly") return addWeeks(d, 1);
    if (freq === "fortnightly") return addWeeks(d, 2);
    if (freq === "monthly") return addMonths(d, 1);
    return d;
  };
  const out: { startsAt: string; endsAt: string | null }[] = [];
  let cur = start;
  let curEnd = end;
  let guard = 0;
  while (cur.getTime() <= stopDate.getTime() && guard < 365) {
    out.push({ startsAt: cur.toISOString(), endsAt: curEnd ? curEnd.toISOString() : null });
    cur = step(cur);
    if (curEnd) curEnd = step(curEnd);
    guard++;
  }
  return out;
}

export const Route = createFileRoute("/_app/sessions/new")({
  head: () => ({ meta: [{ title: "New session — IRB Coaching" }] }),
  component: NewSession,
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

function NewSession() {
  const { user } = useAuth();
  const { activeClub } = useClub();
  const canManage = useCanManage();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [type, setType] = useState<"training" | "fitness" | "theory" | "other">("training");
  const [format, setFormat] = useState<"team" | "individual">("team");
  const [repeat, setRepeat] = useState<"none" | "daily" | "weekly" | "fortnightly" | "monthly">("none");
  const [locations, setLocations] = useState<Loc[] | null>(null);
  const [locationId, setLocationId] = useState<string>("custom");
  const [customLocation, setCustomLocation] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [rsvpDeadline, setRsvpDeadline] = useState("");
  const [capacity, setCapacity] = useState("");
  const [notes, setNotes] = useState("");
  const [survey, setSurvey] = useState(false);
  const [questions, setQuestions] = useState<DraftQ[]>([]);
  const [carpool, setCarpool] = useState(false);
  const [carpools, setCarpools] = useState<CarpoolDraft[]>([]);
  const [pickups, setPickups] = useState<string[]>([]);
  const [trailers, setTrailers] = useState(0);
  const [pendingVehicles, setPendingVehicles] = useState<VehicleDraft[]>([]);
  const [newVehicle, setNewVehicle] = useState<VehicleDraft>({ name: "", seats: 8, pickup: "", can_tow: false });
  const [repeatUntil, setRepeatUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [surveyTemplates, setSurveyTemplates] = useState<{ id: string; name: string; questions: DraftQ[] }[]>([]);
  const [carpoolTemplates, setCarpoolTemplates] = useState<{ id: string; name: string; vehicles: { vehicle_name: string; available_seats: number; can_tow_trailer: boolean }[] }[]>([]);

  const occurrenceCount = useMemo(() => {
    if (repeat === "none" || !startsAt || !repeatUntil) return 1;
    try {
      return generateOccurrences(new Date(startsAt).toISOString(), endsAt ? new Date(endsAt).toISOString() : null, repeat, repeatUntil).length;
    } catch { return 1; }
  }, [repeat, startsAt, endsAt, repeatUntil]);

  useEffect(() => {
    if (!activeClub) return;
    (async () => {
      const [locsRes, surveyRes, carpoolRes] = await Promise.all([
        supabase.from("locations").select("id, name, address").eq("club_id", activeClub.club_id).order("name"),
        supabase.from("survey_templates").select("id, name, questions").eq("club_id", activeClub.club_id).order("name"),
        supabase.from("carpool_templates").select("id, name, vehicles").eq("club_id", activeClub.club_id).order("name"),
      ]);
      setLocations((locsRes.data ?? []) as Loc[]);
      setSurveyTemplates((surveyRes.data ?? []) as typeof surveyTemplates);
      setCarpoolTemplates((carpoolRes.data ?? []) as typeof carpoolTemplates);
    })();
  }, [activeClub?.club_id]);


  if (!canManage) {
    return (
      <AppShell>
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Only coaches and admins can create sessions.
        </Card>
      </AppShell>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeClub) return;

    const usingSaved = locationId !== "custom" && locationId !== "";
    const savedLoc = usingSaved ? (locations ?? []).find((l) => l.id === locationId) : null;
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

    if (carpool && carpools.length > 0) {
      const err = validateCarpoolDrafts(carpools);
      if (err) { toast.error(err); return; }
    }

    setBusy(true);

    const occurrences = generateOccurrences(
      new Date(parsed.data.starts_at).toISOString(),
      parsed.data.ends_at ? new Date(parsed.data.ends_at).toISOString() : null,
      parsed.data.repeat_frequency,
      repeat !== "none" ? (repeatUntil || null) : null,
    );

    const rsvpOffsetMs = parsed.data.rsvp_deadline
      ? new Date(parsed.data.starts_at).getTime() - new Date(parsed.data.rsvp_deadline).getTime()
      : null;

    const cleanPickups = carpool ? pickups.map((p) => p.trim()).filter(Boolean) : [];

    const rowsToInsert = occurrences.map((o) => ({
      club_id: activeClub.club_id,
      title: parsed.data.title,
      session_type: parsed.data.session_type,
      format: parsed.data.format,
      repeat_frequency: parsed.data.repeat_frequency,
      location: parsed.data.location || null,
      location_id: parsed.data.location_id ?? null,
      starts_at: o.startsAt,
      ends_at: o.endsAt,
      rsvp_deadline: rsvpOffsetMs !== null
        ? new Date(new Date(o.startsAt).getTime() - rsvpOffsetMs).toISOString()
        : null,
      capacity: parsed.data.capacity ?? null,
      notes: parsed.data.notes || null,
      survey_enabled: parsed.data.survey_enabled,
      carpool_enabled: parsed.data.carpool_enabled,
      carpool_pickups: cleanPickups.length > 0 ? cleanPickups : null,
      trailers_required: carpool ? trailers : null,
      created_by: user.id,
    }));

    const { data: insertedSessions, error } = await supabase
      .from("sessions").insert(rowsToInsert).select("id, starts_at");
    if (error || !insertedSessions || insertedSessions.length === 0) {
      setBusy(false); toast.error(error?.message ?? "Could not create session"); return;
    }
    // First created session = the original start (used for carpool/survey scaffolding).
    const created = insertedSessions[0];

    // Insert survey questions for every occurrence.
    if (survey && questions.filter((q) => q.question_text.trim()).length > 0) {
      const qrows = insertedSessions.flatMap((s) =>
        questions.filter((q) => q.question_text.trim()).map((q, idx) => ({
          session_id: s.id,
          club_id: activeClub.club_id,
          position: idx,
          question_text: q.question_text.trim(),
          question_type: q.question_type,
          options: q.question_type === "single_choice" ? q.options.filter((o) => o.trim()) : null,
          required: q.required,
        })),
      );
      const { error: qErr } = await supabase.from("session_survey_questions").insert(qrows);
      if (qErr) toast.error(`Sessions created but survey failed: ${qErr.message}`);
    }

    // Carpool vehicles only on the first occurrence.
    if (carpool && carpools.length > 0) {
      const rows = carpools.map((c) => ({
        session_id: created.id,
        club_id: activeClub.club_id,
        driver_user_id: c.driver_user_id,
        vehicle_name: c.vehicle_name.trim(),
        departure_location: c.departure_location.trim(),
        departure_time: new Date(c.departure_time).toISOString(),
        available_seats: c.available_seats,
        notes: c.notes.trim() || null,
        can_tow_trailer: c.can_tow_trailer,
      }));
      const { error: cpErr } = await supabase.from("carpools").insert(rows);
      if (cpErr) {
        setBusy(false);
        toast.error(`Session created, but couldn't add vehicles: ${cpErr.message}`);
        invalidateSessionsCache(activeClub.club_id);
        navigate({ to: "/sessions/$sessionId/carpool", params: { sessionId: created.id } });
        return;
      }
    }

    // Club vehicles (coach setup) — first occurrence only.
    if (carpool && pendingVehicles.length > 0) {
      const vrows = pendingVehicles
        .filter((v) => v.name.trim())
        .map((v) => ({
          session_id: created.id,
          club_id: activeClub.club_id,
          name: v.name.trim(),
          seats: v.seats,
          pickup_location: v.pickup.trim() || null,
          can_tow: v.can_tow,
          created_by: user.id,
        }));
      if (vrows.length > 0) {
        const { error: vErr } = await supabase.from("session_club_vehicles").insert(vrows);
        if (vErr) toast.error(`Session created, but couldn't save club vehicles: ${vErr.message}`);
      }
    }

    setBusy(false);
    invalidateSessionsCache(activeClub.club_id);
    toast.success(insertedSessions.length > 1 ? `${insertedSessions.length} sessions created` : "Session created");

    // Notify all active club members about the new session(s)
    for (const s of insertedSessions) {
      void notifyAllClubMembers({
        club_id: activeClub.club_id,
        type: "session_created",
        title: `New session: ${parsed.data.title}`,
        body: fmt(new Date(s.starts_at), "EEE d MMM 'at' h:mma"),
        link: `/sessions/${s.id}`,
      });
    }

    navigate({ to: "/sessions" });
  };

  const addLocation = async () => {
    if (!activeClub) return;
    const name = prompt("Location name (e.g. North Beach)")?.trim();
    if (!name) return;
    const address = prompt("Address (optional)")?.trim() || null;
    const { data, error } = await supabase.from("locations")
      .insert({ club_id: activeClub.club_id, name, address, created_by: user?.id ?? null })
      .select("id, name, address")
      .single();
    if (error) { toast.error(error.message); return; }
    setLocations((prev) => [...(prev ?? []), data as Loc].sort((a, b) => a.name.localeCompare(b.name)));
    setLocationId(data!.id);
    toast.success("Location saved");
  };

  return (
    <AppShell>
      <Link to="/sessions" className="inline-flex items-center text-sm text-muted-foreground mb-2">
        <ChevronLeft className="h-4 w-4" /> Sessions
      </Link>
      <h1 className="text-2xl font-bold mb-4">New session</h1>
      <Card className="p-4">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Saturday IRB training"
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
            {locations === null ? (
              <div className="h-10 rounded-md border bg-muted/30 animate-pulse" />
            ) : (
              <Select key={`loc-${locations.length}`} value={locationId} onValueChange={setLocationId}>
                <SelectTrigger><SelectValue placeholder="Choose location" /></SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}{l.address ? ` — ${l.address}` : ""}</SelectItem>
                  ))}
                  <SelectItem value="custom">Custom address…</SelectItem>
                </SelectContent>
              </Select>
            )}
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
            {repeat !== "none" && (
              <div className="space-y-1.5 pt-2">
                <Label htmlFor="repeat-until">Repeat until</Label>
                <Input
                  id="repeat-until"
                  type="date"
                  value={repeatUntil}
                  onChange={(e) => setRepeatUntil(e.target.value)}
                  className="h-11"
                />
                {startsAt && repeatUntil && (
                  <p className="text-xs text-muted-foreground">
                    This will create <span className="font-medium text-foreground">{occurrenceCount}</span> session{occurrenceCount === 1 ? "" : "s"}
                    {occurrenceCount > 0 && (
                      <> · last on {fmt(new Date(generateOccurrences(new Date(startsAt).toISOString(), null, repeat, repeatUntil).slice(-1)[0]?.startsAt ?? startsAt), "EEE d MMM")}</>
                    )}.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cap">Capacity</Label>
            <Input id="cap" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Optional" />
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Pre-training survey</div>
                <p className="text-xs text-muted-foreground">Members must answer required questions before they can RSVP.</p>
              </div>
              <Switch
                checked={survey}
                onCheckedChange={(v) => {
                  setSurvey(v);
                  if (v && questions.length === 0) setQuestions([emptyQ()]);
                }}
              />
            </div>
            {survey && (
              <div className="space-y-2">
                {surveyTemplates.length > 0 && (
                  <div className="space-y-1">
                    <Select onValueChange={(id) => {
                      const tpl = surveyTemplates.find((t) => t.id === id);
                      if (tpl) setQuestions(tpl.questions.map((q) => ({
                        question_text: q.question_text ?? "",
                        question_type: (q.question_type ?? "yes_no") as QType,
                        options: q.options ?? [],
                        required: q.required ?? true,
                      })));
                    }}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Load saved survey…" />
                      </SelectTrigger>
                      <SelectContent>
                        {surveyTemplates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {questions.map((q, i) => (
                  <div key={i} className="rounded-md border p-2.5 space-y-2 bg-muted/20">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Q{i + 1}</Badge>
                      <Button type="button" size="icon" variant="ghost" className="ml-auto h-7 w-7"
                        onClick={() => setQuestions((qs) => qs.filter((_, x) => x !== i))}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <Input
                      value={q.question_text}
                      placeholder="e.g. Are you well enough to train?"
                      onChange={(e) => setQuestions((qs) => qs.map((x, idx) => idx === i ? { ...x, question_text: e.target.value } : x))}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={q.question_type} onValueChange={(v) =>
                        setQuestions((qs) => qs.map((x, idx) => idx === i ? { ...x, question_type: v as QType } : x))
                      }>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(TYPE_LABEL) as QType[]).map((t) => (
                            <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <label className="flex items-center justify-end gap-2 text-xs">
                        <span className="text-muted-foreground">Required</span>
                        <Switch checked={q.required} onCheckedChange={(v) =>
                          setQuestions((qs) => qs.map((x, idx) => idx === i ? { ...x, required: v } : x))
                        } />
                      </label>
                    </div>
                    {q.question_type === "single_choice" && (
                      <div className="space-y-1.5">
                        {(q.options.length === 0 ? [""] : q.options).map((opt, oi) => (
                          <Input
                            key={oi}
                            value={opt}
                            placeholder={`Option ${oi + 1}`}
                            onChange={(e) => setQuestions((qs) => qs.map((x, idx) => {
                              if (idx !== i) return x;
                              const next = [...x.options];
                              next[oi] = e.target.value;
                              return { ...x, options: next };
                            }))}
                          />
                        ))}
                        <Button type="button" variant="ghost" size="sm" className="h-7"
                          onClick={() => setQuestions((qs) => qs.map((x, idx) => idx === i ? { ...x, options: [...x.options, ""] } : x))}>
                          <Plus className="h-3 w-3 mr-1" /> Add option
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setQuestions((qs) => [...qs, emptyQ()])}>
                  <Plus className="h-4 w-4 mr-1" /> Add question
                </Button>
              </div>
            )}
          </div>


          <div className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Carpool</div>
                <p className="text-xs text-muted-foreground">Let members coordinate rides. Add vehicles below or save and let members offer rides themselves.</p>
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
            {carpool && (
              <CoachSetupSection
                pickups={pickups}
                onPickupsChange={setPickups}
                trailers={trailers}
                onTrailersChange={setTrailers}
                savedLocations={(locations ?? []) as { id: string; name: string; address: string | null }[]}
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
            {carpool && user && (
              <CarpoolEditor
                clubId={activeClub?.club_id ?? null}
                currentUserId={user.id}
                canPickAnyDriver={canManage}
                value={carpools}
                onChange={setCarpools}
                defaultDeparture={startsAt}
                savedLocations={(locations ?? []) as { id: string; name: string; address: string | null }[]}
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <Button type="submit" disabled={busy} className="w-full h-11">
            {busy ? "Creating..." : "Create session"}
          </Button>
        </form>
      </Card>
    </AppShell>
  );
}
