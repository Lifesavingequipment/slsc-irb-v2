import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCanManage } from "@/lib/club-context";
import { useConfirm } from "@/lib/confirm";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ChevronLeft, Car, Users, MapPin, Clock, Plus, Trash2, Pencil,
  AlertTriangle, UserPlus, HandHelping, CheckCircle2, Settings, Sparkles, Bus, Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { buildNameMap } from "@/lib/names";

export const Route = createFileRoute("/_app/sessions/$sessionId/carpool")({
  head: () => ({ meta: [{ title: "Carpool — IRB Coaching" }] }),
  component: CarpoolPage,
});

type Session = {
  id: string; club_id: string; title: string; starts_at: string;
  location: string | null;
  carpool_pickups: string[] | null;
  trailers_required: number | null;
};
type Carpool = {
  id: string; session_id: string; club_id: string; driver_user_id: string;
  vehicle_name: string; departure_location: string; departure_time: string;
  available_seats: number; notes: string | null;
  status: "open" | "full" | "cancelled";
  can_tow_trailer: boolean;
};
type Passenger = {
  id: string; carpool_id: string; user_id: string;
  pickup_location: string | null; notes: string | null; assigned_at: string;
};
type RideRequest = {
  id: string; session_id: string; user_id: string;
  pickup_location: string; preferred_time: string | null;
  notes: string | null; status: "pending" | "assigned" | "cancelled";
};
type ClubVehicle = {
  id: string; session_id: string; club_id: string;
  name: string; seats: number; pickup_location: string | null; can_tow: boolean;
};
type SavedLocation = { id: string; name: string; address: string | null };

function formatLocation(l: SavedLocation): string {
  return l.address ? `${l.name} — ${l.address}` : l.name;
}

function CarpoolPage() {
  const { sessionId } = Route.useParams();
  const { user } = useAuth();
  const canManage = useCanManage();
  const confirm = useConfirm();

  const [session, setSession] = useState<Session | null>(null);
  const [carpools, setCarpools] = useState<Carpool[]>([]);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [clubVehicles, setClubVehicles] = useState<ClubVehicle[]>([]);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const [offerOpen, setOfferOpen] = useState(false);
  const [editCarpool, setEditCarpool] = useState<Carpool | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState<{ requestId: string; userId: string } | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);

  const load = useCallback(async () => {
    const { data: s } = await supabase.from("sessions")
      .select("id, club_id, title, starts_at, location, carpool_pickups, trailers_required")
      .eq("id", sessionId).maybeSingle();
    setSession(s as Session | null);

    const [cp, pas, rq, cv, locs] = await Promise.all([
      supabase.from("carpools").select("*").eq("session_id", sessionId).order("departure_time"),
      supabase.from("carpool_passengers").select("*").eq("session_id", sessionId),
      supabase.from("carpool_requests").select("*").eq("session_id", sessionId).order("created_at"),
      supabase.from("session_club_vehicles").select("*").eq("session_id", sessionId).order("created_at"),
      s ? supabase.from("locations").select("id, name, address").eq("club_id", (s as Session).club_id).order("name") : Promise.resolve({ data: [] }),
    ]);
    const cps = (cp.data ?? []) as Carpool[];
    const ps = (pas.data ?? []) as Passenger[];
    const rs = (rq.data ?? []) as RideRequest[];
    const cvs = (cv.data ?? []) as ClubVehicle[];
    setCarpools(cps);
    setPassengers(ps);
    setRequests(rs);
    setClubVehicles(cvs);
    setSavedLocations(((locs as { data: SavedLocation[] | null }).data ?? []) as SavedLocation[]);

    const ids = new Set<string>();
    cps.forEach((c) => ids.add(c.driver_user_id));
    ps.forEach((p) => ids.add(p.user_id));
    rs.forEach((r) => ids.add(r.user_id));
    if (ids.size) {
      const { data: profs } = await supabase.from("profiles")
        .select("id, full_name").in("id", Array.from(ids));
      setNameMap(buildNameMap((profs ?? []).map((p) => ({ id: p.id, full_name: p.full_name }))));
    } else {
      setNameMap({});
    }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  const dn = useCallback((id: string) => nameMap[id] || "Member", [nameMap]);

  const pickups = useMemo(
    () => (session?.carpool_pickups ?? []).filter((p) => p.trim()),
    [session?.carpool_pickups],
  );
  const trailersRequired = session?.trailers_required ?? 0;

  const myAssignment = useMemo(
    () => passengers.find((p) => p.user_id === user?.id) ?? null,
    [passengers, user?.id],
  );
  const myRequest = useMemo(
    () => requests.find((r) => r.user_id === user?.id && r.status !== "cancelled") ?? null,
    [requests, user?.id],
  );
  const iAmDriver = useMemo(
    () => carpools.some((c) => c.driver_user_id === user?.id && c.status !== "cancelled"),
    [carpools, user?.id],
  );

  const passByCarpool = useMemo(() => {
    const m = new Map<string, Passenger[]>();
    passengers.forEach((p) => {
      const arr = m.get(p.carpool_id) ?? [];
      arr.push(p);
      m.set(p.carpool_id, arr);
    });
    return m;
  }, [passengers]);

  const activeCarpools = carpools.filter((c) => c.status !== "cancelled");
  const totalSeats = activeCarpools.reduce((acc, c) => acc + c.available_seats, 0)
    + clubVehicles.reduce((acc, v) => acc + v.seats, 0);
  const seatsTaken = passengers.length;
  const seatsLeft = Math.max(0, totalSeats - seatsTaken);
  const pendingRequests = requests.filter((r) => r.status === "pending");
  const transportShortfall = pendingRequests.length > seatsLeft;
  const towingCapable = activeCarpools.filter((c) => c.can_tow_trailer).length
    + clubVehicles.filter((v) => v.can_tow).length;
  const trailerShortfall = trailersRequired > towingCapable;

  // --- Actions ---
  const offerRide = async (form: OfferForm) => {
    if (!user || !session) return;
    setBusy(true);
    const { error } = await supabase.from("carpools").insert({
      session_id: sessionId,
      club_id: session.club_id,
      driver_user_id: user.id,
      vehicle_name: form.vehicle_name.trim(),
      departure_location: form.departure_location.trim(),
      departure_time: new Date(form.departure_time).toISOString(),
      available_seats: form.available_seats,
      notes: form.notes.trim() || null,
      can_tow_trailer: form.can_tow_trailer,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Ride offered");
    setOfferOpen(false);
    load();
  };

  const cancelCarpool = async (id: string) => {
    const ok = await confirm({
      title: "Cancel this ride?",
      description: "Passengers will be unassigned and the ride removed. This can't be undone.",
      confirmText: "Cancel ride",
    });
    if (!ok) return;
    const { error } = await supabase.from("carpools").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Ride cancelled");
    load();
  };

  const updateCarpool = async (id: string, patch: Partial<Pick<Carpool, "available_seats" | "can_tow_trailer" | "vehicle_name" | "departure_location" | "departure_time" | "notes">>) => {
    setBusy(true);
    const { error } = await supabase.from("carpools").update(patch).eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Ride updated");
    setEditCarpool(null);
    load();
  };


  const submitRequest = async (form: RequestForm) => {
    if (!user || !session) return;
    setBusy(true);
    const { error } = await supabase.from("carpool_requests").upsert({
      session_id: sessionId,
      club_id: session.club_id,
      user_id: user.id,
      pickup_location: form.pickup_location.trim(),
      preferred_time: form.preferred_time ? new Date(form.preferred_time).toISOString() : null,
      notes: form.notes.trim() || null,
      status: "pending",
    }, { onConflict: "session_id,user_id" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Ride request posted");
    setRequestOpen(false);
    load();
  };

  const cancelRequest = async (id: string) => {
    const ok = await confirm({
      title: "Cancel your ride request?",
      description: "Drivers won't see your request anymore. You can post a new one later.",
      confirmText: "Cancel request",
    });
    if (!ok) return;
    const { error } = await supabase.from("carpool_requests").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Request cancelled");
    load();
  };

  const joinCarpool = async (carpoolId: string) => {
    if (!user) return;
    if (myAssignment) return toast.error("You're already in a vehicle for this session");
    setBusy(true);
    const { error } = await supabase.from("carpool_passengers").insert({
      carpool_id: carpoolId,
      session_id: sessionId,
      user_id: user.id,
      pickup_location: myRequest?.pickup_location ?? null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (myRequest) {
      await supabase.from("carpool_requests").update({ status: "assigned" }).eq("id", myRequest.id);
    }
    toast.success("Joined ride");
    load();
  };

  const leaveCarpool = async (passengerId: string) => {
    const ok = await confirm({
      title: "Leave this ride?",
      description: "You'll be removed from the passenger list and the seat freed up.",
      confirmText: "Leave ride",
    });
    if (!ok) return;
    const { error } = await supabase.from("carpool_passengers").delete().eq("id", passengerId);
    if (error) return toast.error(error.message);
    toast.success("Left ride");
    load();
  };

  const assignPassenger = async (carpoolId: string, userId: string, requestId?: string) => {
    setBusy(true);
    await supabase.from("carpool_passengers").delete()
      .eq("session_id", sessionId).eq("user_id", userId);
    const { error } = await supabase.from("carpool_passengers").insert({
      carpool_id: carpoolId,
      session_id: sessionId,
      user_id: userId,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (requestId) {
      await supabase.from("carpool_requests").update({ status: "assigned" }).eq("id", requestId);
    }
    toast.success("Passenger assigned");
    setAssignOpen(null);
    load();
  };

  // Smart auto-allocate: assign pending requests to driver carpools.
  // 3 passes per driver: (1) same pickup, (2) any unassigned with same pickup again (no-op safety),
  // (3) anyone left fills remaining seats. Greedy across drivers in seat-count order.
  const autoAllocate = async () => {
    if (!canManage) return;
    if (pendingRequests.length === 0) return toast.info("No pending requests to allocate.");
    if (activeCarpools.length === 0) return toast.error("No driver vehicles to allocate into.");

    const remaining = [...pendingRequests];
    type Plan = { carpoolId: string; userId: string; requestId: string };
    const plan: Plan[] = [];

    // Sort drivers by seats-available descending so we fill biggest first
    const driverState = activeCarpools.map((c) => ({
      carpoolId: c.id,
      pickup: c.departure_location,
      seatsLeft: c.available_seats - (passByCarpool.get(c.id)?.length ?? 0),
    })).filter((d) => d.seatsLeft > 0);

    // Pass 1: same pickup
    for (const d of driverState) {
      for (let i = remaining.length - 1; i >= 0; i--) {
        if (d.seatsLeft <= 0) break;
        if (remaining[i].pickup_location?.toLowerCase().trim()
          === d.pickup?.toLowerCase().trim()) {
          plan.push({ carpoolId: d.carpoolId, userId: remaining[i].user_id, requestId: remaining[i].id });
          d.seatsLeft--;
          remaining.splice(i, 1);
        }
      }
    }
    // Pass 2: greedy fill remaining
    for (const d of driverState) {
      for (let i = remaining.length - 1; i >= 0; i--) {
        if (d.seatsLeft <= 0) break;
        plan.push({ carpoolId: d.carpoolId, userId: remaining[i].user_id, requestId: remaining[i].id });
        d.seatsLeft--;
        remaining.splice(i, 1);
      }
    }

    if (plan.length === 0) return toast.error("No seats available.");

    setBusy(true);
    // Clear any prior assignments for these users (avoid duplicates)
    await supabase.from("carpool_passengers").delete()
      .eq("session_id", sessionId).in("user_id", plan.map((p) => p.userId));
    const { error } = await supabase.from("carpool_passengers").insert(
      plan.map((p) => ({
        carpool_id: p.carpoolId, session_id: sessionId, user_id: p.userId,
      })),
    );
    if (!error) {
      await supabase.from("carpool_requests")
        .update({ status: "assigned" })
        .in("id", plan.map((p) => p.requestId));
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Allocated ${plan.length} rider${plan.length === 1 ? "" : "s"}${remaining.length ? `, ${remaining.length} still unassigned` : ""}`);
    load();
  };

  // --- Coach setup writes ---
  const saveSessionSetup = async (patch: { carpool_pickups?: string[]; trailers_required?: number }) => {
    const { error } = await supabase.from("sessions").update(patch).eq("id", sessionId);
    if (error) { toast.error(error.message); return; }
    load();
  };

  if (!session) {
    return <AppShell><div className="py-12 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;
  }

  return (
    <AppShell>
      <Link to="/sessions/$sessionId" params={{ sessionId }}
        className="inline-flex items-center text-sm text-muted-foreground mb-2">
        <ChevronLeft className="h-4 w-4" /> Back to session
      </Link>

      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Carpool & transport</div>
            <h1 className="mt-1 text-xl font-bold">{session.title}</h1>
            <div className="mt-1 text-xs text-muted-foreground">
              {format(new Date(session.starts_at), "EEE d MMM · h:mma")}
              {session.location && <> · {session.location}</>}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <SummaryStat label="Drivers" value={activeCarpools.length + clubVehicles.length} icon={Car} />
          <SummaryStat label="Seats left" value={`${seatsLeft}/${totalSeats}`} icon={Users} />
          <SummaryStat label="Need ride" value={pendingRequests.length} icon={HandHelping} />
        </div>

        {transportShortfall && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div>
              <div className="font-medium text-destructive">Not enough seats</div>
              <div className="text-xs text-muted-foreground">
                {pendingRequests.length} member(s) need a ride but only {seatsLeft} seat(s) available.
              </div>
            </div>
          </div>
        )}

        {trailersRequired > 0 && (
          <div className={`mt-2 flex items-start gap-2 rounded-md border p-3 text-sm ${
            trailerShortfall ? "border-destructive/40 bg-destructive/10" : "border-success/40 bg-success/10"
          }`}>
            <Wrench className={`h-4 w-4 mt-0.5 shrink-0 ${trailerShortfall ? "text-destructive" : "text-success"}`} />
            <div className="text-xs">
              {trailersRequired} trailer{trailersRequired === 1 ? "" : "s"} required · {towingCapable} vehicle{towingCapable === 1 ? "" : "s"} can tow
            </div>
          </div>
        )}
      </Card>

      {/* Action buttons */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button onClick={() => setOfferOpen(true)} className="h-11">
          <Car className="h-4 w-4" /> Offer ride
        </Button>
        <Button
          variant={myRequest ? "outline" : "secondary"}
          onClick={() => setRequestOpen(true)}
          className="h-11"
        >
          <HandHelping className="h-4 w-4" />
          {myRequest ? "Edit request" : "Need ride"}
        </Button>
      </div>

      {/* Coach tools */}
      {canManage && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => setSetupOpen(true)} className="h-10">
            <Settings className="h-4 w-4" /> Coach setup
          </Button>
          <Button variant="default" onClick={autoAllocate} disabled={busy || pendingRequests.length === 0} className="h-10">
            <Sparkles className="h-4 w-4" /> Auto-allocate
          </Button>
        </div>
      )}

      {/* Pickup stops summary (visible to all) */}
      {pickups.length > 0 && (
        <Card className="mt-3 p-3">
          <div className="text-xs font-semibold mb-2 flex items-center gap-1">
            <MapPin className="h-3 w-3" /> Pickup stops
          </div>
          <div className="flex flex-wrap gap-1">
            {pickups.map((p) => (
              <Badge key={p} variant="secondary" className="font-normal">{p}</Badge>
            ))}
          </div>
        </Card>
      )}

      {/* My status */}
      {(myAssignment || myRequest) && (
        <Card className="mt-3 p-3 text-sm">
          {myAssignment && (() => {
            const c = carpools.find((x) => x.id === myAssignment.carpool_id);
            return (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span>You're riding with <strong>{c ? dn(c.driver_user_id) : "—"}</strong>{c ? ` (${c.vehicle_name})` : ""}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => leaveCarpool(myAssignment.id)}>Leave</Button>
              </div>
            );
          })()}
          {!myAssignment && myRequest && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-warning" />
                <span>Ride request pending — pickup at {myRequest.pickup_location}</span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => cancelRequest(myRequest.id)}>Cancel</Button>
            </div>
          )}
        </Card>
      )}

      {/* Drivers / vehicles */}
      <h2 className="mt-5 mb-2 text-sm font-semibold">Drivers ({activeCarpools.length})</h2>
      {activeCarpools.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No drivers yet. Tap "Offer ride" to add yours.
        </Card>
      ) : (
        <div className="space-y-3">
          {activeCarpools.map((c) => {
            const pax = passByCarpool.get(c.id) ?? [];
            const seatsRemaining = c.available_seats - pax.length;
            const isFull = seatsRemaining <= 0;
            const isMine = c.driver_user_id === user?.id;
            const canEdit = isMine || canManage;
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Car className="h-4 w-4" />
                      <span className="font-semibold">{c.vehicle_name}</span>
                      {isFull ? (
                        <Badge variant="destructive">Full</Badge>
                      ) : (
                        <Badge variant="secondary">{seatsRemaining} seat{seatsRemaining === 1 ? "" : "s"} left</Badge>
                      )}
                      {c.can_tow_trailer && <Badge variant="outline" className="text-xs"><Wrench className="h-3 w-3 mr-1" /> Tow</Badge>}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">Driver: {dn(c.driver_user_id)}</div>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => setEditCarpool(c)} aria-label="Edit ride">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => cancelCarpool(c.id)} aria-label="Cancel ride">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2"><MapPin className="h-3 w-3" /> {c.departure_location}</div>
                  <div className="flex items-center gap-2"><Clock className="h-3 w-3" /> {format(new Date(c.departure_time), "EEE d MMM · h:mma")}</div>
                </div>
                {c.notes && <p className="mt-2 text-xs whitespace-pre-wrap">{c.notes}</p>}

                <div className="mt-3 border-t pt-3">
                  <div className="text-xs font-semibold mb-1">Passengers ({pax.length}/{c.available_seats})</div>
                  {pax.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No passengers yet.</div>
                  ) : (
                    <ul className="space-y-1">
                      {pax.map((p) => (
                        <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate">{dn(p.user_id)}</span>
                          {(canManage || p.user_id === user?.id || isMine) && (
                            <Button size="sm" variant="ghost" onClick={() => leaveCarpool(p.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {!isFull && !isMine && !myAssignment && user && c.driver_user_id !== user.id && (
                    <Button size="sm" className="mt-2 w-full" onClick={() => joinCarpool(c.id)} disabled={busy}>
                      <UserPlus className="h-3 w-3" /> Join this ride
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Club vehicles */}
      {clubVehicles.length > 0 && (
        <>
          <h2 className="mt-5 mb-2 text-sm font-semibold">Club vehicles ({clubVehicles.length})</h2>
          <div className="space-y-2">
            {clubVehicles.map((v) => (
              <Card key={v.id} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <Bus className="h-4 w-4" />
                    <span className="font-semibold text-sm truncate">{v.name}</span>
                    <Badge variant="secondary">{v.seats} seats</Badge>
                    {v.can_tow && <Badge variant="outline" className="text-xs"><Wrench className="h-3 w-3 mr-1" /> Tow</Badge>}
                  </div>
                </div>
                {v.pickup_location && (
                  <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {v.pickup_location}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Need ride */}
      <h2 className="mt-5 mb-2 text-sm font-semibold">Need transport ({pendingRequests.length})</h2>
      {pendingRequests.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">No pending ride requests.</Card>
      ) : (
        <div className="space-y-2">
          {pendingRequests.map((r) => (
            <Card key={r.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{dn(r.user_id)}</div>
                  <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {r.pickup_location}
                  </div>
                  {r.preferred_time && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {format(new Date(r.preferred_time), "EEE · h:mma")}
                    </div>
                  )}
                  {r.notes && <p className="mt-1 text-xs whitespace-pre-wrap">{r.notes}</p>}
                </div>
                {canManage && (
                  <Button size="sm" onClick={() => setAssignOpen({ requestId: r.id, userId: r.user_id })}>
                    Assign
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <OfferRideDialog
        open={offerOpen}
        onOpenChange={setOfferOpen}
        onSubmit={offerRide}
        busy={busy}
        defaultLocation={session.location ?? ""}
        defaultTime={session.starts_at}
        iAmDriver={iAmDriver}
        pickups={pickups}
        savedLocations={savedLocations}
      />

      <RequestRideDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        onSubmit={submitRequest}
        busy={busy}
        existing={myRequest}
        pickups={pickups}
        savedLocations={savedLocations}
      />

      {canManage && (
        <CoachSetupDialog
          open={setupOpen}
          onOpenChange={setSetupOpen}
          session={session}
          clubVehicles={clubVehicles}
          onSavePickups={(p) => saveSessionSetup({ carpool_pickups: p })}
          onSaveTrailers={(n) => saveSessionSetup({ trailers_required: n })}
          onChange={load}
          sessionId={sessionId}
          clubId={session.club_id}
          savedLocations={savedLocations}
        />
      )}

      <EditRideDialog
        carpool={editCarpool}
        onOpenChange={(o) => !o && setEditCarpool(null)}
        onSave={(patch) => editCarpool && updateCarpool(editCarpool.id, patch)}
        busy={busy}
      />

      {/* Coach assign dialog */}
      <Dialog open={!!assignOpen} onOpenChange={(o) => !o && setAssignOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign to a vehicle</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {activeCarpools.map((c) => {
              const pax = passByCarpool.get(c.id) ?? [];
              const seatsRemaining = c.available_seats - pax.length;
              const isDriver = assignOpen && c.driver_user_id === assignOpen.userId;
              const disabled = seatsRemaining <= 0 || !!isDriver;
              return (
                <button
                  key={c.id}
                  disabled={disabled}
                  onClick={() => assignOpen && assignPassenger(c.id, assignOpen.userId, assignOpen.requestId)}
                  className="w-full text-left rounded-md border p-3 disabled:opacity-50 hover:bg-accent transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">{c.vehicle_name}</div>
                    <Badge variant={seatsRemaining > 0 ? "secondary" : "destructive"}>
                      {seatsRemaining}/{c.available_seats}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">Driver: {dn(c.driver_user_id)}</div>
                  {isDriver && <div className="text-xs text-destructive mt-1">Member is the driver</div>}
                </button>
              );
            })}
            {activeCarpools.length === 0 && (
              <div className="text-sm text-muted-foreground">No vehicles available.</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function SummaryStat({ label, value, icon: Icon }: {
  label: string; value: string | number; icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-md bg-muted/40 p-3">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

// ===== Forms =====
type OfferForm = {
  vehicle_name: string;
  departure_location: string;
  departure_time: string;
  available_seats: number;
  notes: string;
  can_tow_trailer: boolean;
};

function OfferRideDialog({ open, onOpenChange, onSubmit, busy, defaultLocation, defaultTime, iAmDriver, pickups, savedLocations }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  onSubmit: (f: OfferForm) => void; busy: boolean;
  defaultLocation: string; defaultTime: string; iAmDriver: boolean;
  pickups: string[];
  savedLocations: SavedLocation[];
}) {
  const initial = (): OfferForm => ({
    vehicle_name: "",
    departure_location: pickups[0] ?? defaultLocation,
    departure_time: toLocalInput(defaultTime),
    available_seats: 3,
    notes: "",
    can_tow_trailer: false,
  });
  const [form, setForm] = useState<OfferForm>(initial);
  useEffect(() => { if (open) setForm(initial()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);

  const submit = () => {
    if (!form.vehicle_name.trim()) return toast.error("Vehicle name required");
    if (!form.departure_location.trim()) return toast.error("Departure location required");
    if (!form.departure_time) return toast.error("Departure time required");
    const seats = Number(form.available_seats);
    if (!Number.isFinite(seats) || !Number.isInteger(seats) || seats < 1) {
      return toast.error("Seats must be a whole number of 1 or more");
    }
    if (seats > 20) return toast.error("Seats can't exceed 20");
    onSubmit({ ...form, available_seats: seats });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Offer a ride</DialogTitle>
        </DialogHeader>
        {iAmDriver && (
          <div className="text-xs text-muted-foreground">You're already offering a ride — this adds another vehicle.</div>
        )}
        <div className="space-y-3">
          <div>
            <Label>Vehicle</Label>
            <Input value={form.vehicle_name} maxLength={100}
              placeholder="e.g. Blue Hilux"
              onChange={(e) => setForm({ ...form, vehicle_name: e.target.value })} />
          </div>
          <div>
            <Label>Departure location</Label>
            {pickups.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {pickups.map((p) => (
                  <button key={p} type="button"
                    onClick={() => setForm({ ...form, departure_location: p })}
                    className={`rounded-md border px-2 py-1 text-xs transition ${
                      form.departure_location === p
                        ? "border-primary bg-primary/10 text-primary"
                        : "hover:bg-accent"
                    }`}>{p}</button>
                ))}
                <button type="button"
                  onClick={() => setForm({ ...form, departure_location: "" })}
                  className={`rounded-md border px-2 py-1 text-xs transition ${
                    !pickups.includes(form.departure_location)
                      ? "border-primary bg-primary/10 text-primary"
                      : "hover:bg-accent"
                  }`}>Other…</button>
              </div>
            ) : null}
            {(pickups.length === 0 || !pickups.includes(form.departure_location)) && (
              <Input className={pickups.length > 0 ? "mt-2" : ""} value={form.departure_location} maxLength={200}
                onChange={(e) => setForm({ ...form, departure_location: e.target.value })} />
            )}
            <SavedLocationPicker
              locations={savedLocations}
              onPick={(v) => setForm({ ...form, departure_location: v })}
            />
          </div>
          <div>
            <Label>Departure time</Label>
            <Input type="datetime-local" value={form.departure_time}
              onChange={(e) => setForm({ ...form, departure_time: e.target.value })} />
          </div>
          <div>
            <Label>Available seats</Label>
            <Input type="number" min={1} max={20} value={form.available_seats}
              onChange={(e) => setForm({ ...form, available_seats: Number(e.target.value) })} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Can tow trailer</div>
              <p className="text-xs text-muted-foreground">Helps coaches plan equipment.</p>
            </div>
            <Switch checked={form.can_tow_trailer}
              onCheckedChange={(v) => setForm({ ...form, can_tow_trailer: v })} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} maxLength={500} rows={3}
              placeholder="Optional details for passengers"
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}><Plus className="h-4 w-4" /> Offer ride</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type RequestForm = {
  pickup_location: string;
  preferred_time: string;
  notes: string;
};

function RequestRideDialog({ open, onOpenChange, onSubmit, busy, existing, pickups, savedLocations }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  onSubmit: (f: RequestForm) => void; busy: boolean;
  existing: RideRequest | null;
  pickups: string[];
  savedLocations: SavedLocation[];
}) {
  const initial = (): RequestForm => ({
    pickup_location: existing?.pickup_location ?? pickups[0] ?? "",
    preferred_time: existing?.preferred_time ? toLocalInput(existing.preferred_time) : "",
    notes: existing?.notes ?? "",
  });
  const [form, setForm] = useState<RequestForm>(initial);
  useEffect(() => { if (open) setForm(initial()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);

  const submit = () => {
    if (!form.pickup_location.trim()) return toast.error("Pickup location required");
    onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit ride request" : "Need a ride"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Pickup location</Label>
            {pickups.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {pickups.map((p) => (
                  <button key={p} type="button"
                    onClick={() => setForm({ ...form, pickup_location: p })}
                    className={`rounded-md border px-2 py-1 text-xs transition ${
                      form.pickup_location === p
                        ? "border-primary bg-primary/10 text-primary"
                        : "hover:bg-accent"
                    }`}>{p}</button>
                ))}
                <button type="button"
                  onClick={() => setForm({ ...form, pickup_location: "" })}
                  className={`rounded-md border px-2 py-1 text-xs transition ${
                    !pickups.includes(form.pickup_location)
                      ? "border-primary bg-primary/10 text-primary"
                      : "hover:bg-accent"
                  }`}>Other…</button>
              </div>
            ) : null}
            {(pickups.length === 0 || !pickups.includes(form.pickup_location)) && (
              <Input className={pickups.length > 0 ? "mt-2" : ""} value={form.pickup_location} maxLength={200}
                placeholder="Where can a driver collect you?"
                onChange={(e) => setForm({ ...form, pickup_location: e.target.value })} />
            )}
            <SavedLocationPicker
              locations={savedLocations}
              onPick={(v) => setForm({ ...form, pickup_location: v })}
            />
          </div>
          <div>
            <Label>Preferred departure time</Label>
            <Input type="datetime-local" value={form.preferred_time}
              onChange={(e) => setForm({ ...form, preferred_time: e.target.value })} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} maxLength={500} rows={3}
              placeholder="Anything drivers should know"
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{existing ? "Save" : "Post request"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== Coach Setup Dialog =====
function CoachSetupDialog({
  open, onOpenChange, session, clubVehicles, onSavePickups, onSaveTrailers, onChange, sessionId, clubId, savedLocations,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  session: Session;
  clubVehicles: ClubVehicle[];
  onSavePickups: (p: string[]) => Promise<void> | void;
  onSaveTrailers: (n: number) => Promise<void> | void;
  onChange: () => void;
  sessionId: string;
  clubId: string;
  savedLocations: SavedLocation[];
}) {
  const [pickups, setPickups] = useState<string[]>([]);
  const [trailers, setTrailers] = useState<number>(0);
  const [newVehicle, setNewVehicle] = useState<{ name: string; seats: number; pickup: string; can_tow: boolean }>({
    name: "", seats: 8, pickup: "", can_tow: false,
  });

  useEffect(() => {
    if (open) {
      setPickups([...(session.carpool_pickups ?? []), ""]);
      setTrailers(session.trailers_required ?? 0);
      setNewVehicle({ name: "", seats: 8, pickup: "", can_tow: false });
    }
  }, [open, session.carpool_pickups, session.trailers_required]);

  const savePickups = async () => {
    const clean = pickups.map((p) => p.trim()).filter(Boolean);
    await onSavePickups(clean);
    toast.success("Pickup stops saved");
  };

  const addVehicle = async () => {
    if (!newVehicle.name.trim()) return toast.error("Vehicle name required");
    const { error } = await supabase.from("session_club_vehicles").insert({
      session_id: sessionId, club_id: clubId,
      name: newVehicle.name.trim(),
      seats: newVehicle.seats,
      pickup_location: newVehicle.pickup.trim() || null,
      can_tow: newVehicle.can_tow,
    });
    if (error) return toast.error(error.message);
    setNewVehicle({ name: "", seats: 8, pickup: "", can_tow: false });
    onChange();
    toast.success("Vehicle added");
  };

  const confirmDel = useConfirm();
  const removeVehicle = async (id: string, name: string) => {
    const ok = await confirmDel({
      title: `Remove ${name}?`,
      description: "This club vehicle won't count toward seats for this session anymore.",
      confirmText: "Remove",
    });
    if (!ok) return;
    const { error } = await supabase.from("session_club_vehicles").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Vehicle removed");
    onChange();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Coach setup</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Pickup Stops */}
          <section className="space-y-2">
            <Label className="text-sm font-semibold">Pickup stops</Label>
            <p className="text-xs text-muted-foreground">Members pick from these when requesting a ride.</p>
            {pickups.map((stop, i) => (
              <div key={i} className="space-y-1">
                <div className="flex gap-2">
                  <Input
                    value={stop}
                    placeholder={`Stop ${i + 1} e.g. Kurrawa SLSC (5:00pm)`}
                    onChange={(e) => setPickups(pickups.map((s, idx) => idx === i ? e.target.value : s))}
                  />
                  <Button variant="ghost" size="icon" onClick={() =>
                    setPickups(pickups.filter((_, idx) => idx !== i))
                  }><Trash2 className="h-4 w-4" /></Button>
                </div>
                <SavedLocationPicker
                  locations={savedLocations}
                  onPick={(v) => setPickups(pickups.map((s, idx) => idx === i ? v : s))}
                />
              </div>
            ))}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPickups([...pickups, ""])}>
                <Plus className="h-3 w-3" /> Add stop
              </Button>
              <Button size="sm" onClick={savePickups}>Save stops</Button>
            </div>
          </section>

          {/* Trailers */}
          <section className="space-y-2">
            <Label className="text-sm font-semibold">Trailers required</Label>
            <div className="flex gap-2 items-center">
              <Select value={String(trailers)} onValueChange={(v) => setTrailers(Number(v))}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[0, 1, 2, 3, 4].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} trailer{n === 1 ? "" : "s"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={async () => {
                await onSaveTrailers(trailers);
                toast.success("Trailers saved");
              }}>Save</Button>
            </div>
          </section>

          {/* Club Vehicles */}
          <section className="space-y-2">
            <Label className="text-sm font-semibold">Club vehicles</Label>
            <p className="text-xs text-muted-foreground">Bus, van, or any club-owned vehicle attending this session.</p>
            {clubVehicles.length > 0 && (
              <div className="space-y-1">
                {clubVehicles.map((v) => (
                  <div key={v.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{v.name}</span>
                        <Badge variant="secondary">{v.seats}</Badge>
                        {v.can_tow && <Badge variant="outline" className="text-xs">Tow</Badge>}
                      </div>
                      {v.pickup_location && (
                        <div className="text-xs text-muted-foreground">{v.pickup_location}</div>
                      )}
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => removeVehicle(v.id, v.name)} aria-label={`Remove ${v.name}`}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="rounded-md border p-3 space-y-2">
              <Input placeholder="Vehicle name (e.g. Club Bus)" value={newVehicle.name}
                onChange={(e) => setNewVehicle({ ...newVehicle, name: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" min={1} max={50} placeholder="Seats" value={newVehicle.seats}
                  onChange={(e) => setNewVehicle({ ...newVehicle, seats: Number(e.target.value) })} />
                <Input placeholder="Pickup (optional)" value={newVehicle.pickup}
                  onChange={(e) => setNewVehicle({ ...newVehicle, pickup: e.target.value })} />
              </div>
              <SavedLocationPicker
                locations={savedLocations}
                onPick={(v) => setNewVehicle({ ...newVehicle, pickup: v })}
              />
              <div className="flex items-center justify-between">
                <Label className="text-sm">Can tow trailer</Label>
                <Switch checked={newVehicle.can_tow}
                  onCheckedChange={(v) => setNewVehicle({ ...newVehicle, can_tow: v })} />
              </div>
              <Button size="sm" onClick={addVehicle} className="w-full">
                <Plus className="h-3 w-3" /> Add vehicle
              </Button>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function SavedLocationPicker({ locations, onPick }: {
  locations: SavedLocation[];
  onPick: (value: string) => void;
}) {
  if (locations.length === 0) return null;
  return (
    <div className="flex items-center gap-1">
      <Select onValueChange={(id) => {
        const loc = locations.find((l) => l.id === id);
        if (loc) onPick(formatLocation(loc));
      }}>
        <SelectTrigger className="h-7 text-xs w-auto gap-1 px-2">
          <MapPin className="h-3 w-3" />
          <SelectValue placeholder="Insert saved location" />
        </SelectTrigger>
        <SelectContent>
          {locations.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              <div className="flex flex-col">
                <span className="text-sm">{l.name}</span>
                {l.address && <span className="text-xs text-muted-foreground">{l.address}</span>}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type EditRidePatch = Partial<Pick<Carpool, "available_seats" | "can_tow_trailer" | "vehicle_name" | "departure_location" | "notes">>;

function EditRideDialog({ carpool, onOpenChange, onSave, busy }: {
  carpool: Carpool | null;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: EditRidePatch) => void;
  busy: boolean;
}) {
  const [seats, setSeats] = useState(0);
  const [canTow, setCanTow] = useState(false);
  const [vehicleName, setVehicleName] = useState("");
  const [departureLocation, setDepartureLocation] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (carpool) {
      setSeats(carpool.available_seats);
      setCanTow(carpool.can_tow_trailer);
      setVehicleName(carpool.vehicle_name);
      setDepartureLocation(carpool.departure_location);
      setNotes(carpool.notes ?? "");
    }
  }, [carpool]);

  const submit = () => {
    if (!vehicleName.trim()) return toast.error("Vehicle name required");
    const n = Number(seats);
    if (!Number.isInteger(n) || n < 1 || n > 20) return toast.error("Seats must be 1-20");
    onSave({
      vehicle_name: vehicleName.trim(),
      departure_location: departureLocation.trim(),
      available_seats: n,
      can_tow_trailer: canTow,
      notes: notes.trim() || null,
    });
  };

  return (
    <Dialog open={!!carpool} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit ride</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Vehicle</Label>
            <Input className="h-11" value={vehicleName} onChange={(e) => setVehicleName(e.target.value)} maxLength={100} />
          </div>
          <div>
            <Label>Departure location</Label>
            <Input className="h-11" value={departureLocation} onChange={(e) => setDepartureLocation(e.target.value)} maxLength={200} />
          </div>
          <div>
            <Label>Available seats</Label>
            <Input className="h-11" type="number" min={1} max={20} value={seats}
              onChange={(e) => setSeats(Number(e.target.value))} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Can tow trailer</div>
              <p className="text-xs text-muted-foreground">Helps coaches plan equipment.</p>
            </div>
            <Switch checked={canTow} onCheckedChange={setCanTow} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} rows={3} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
