import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Waves, LogOut, Clock, CheckCircle2, Copy, Mail, Share2, Ticket, UserCog } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/onboarding/")({
  head: () => ({ meta: [{ title: "Get started — IRB Coaching" }] }),
  component: Onboarding,
});

type ClubRow = { id: string; club_name: string; address: string | null };

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[bytes[i] % chars.length];
  return `IRB-${out}`;
}

type CreatedClub = { id: string; name: string; inviteCode: string };

function Onboarding() {
  const { user, signOut } = useAuth();
  const { memberships, refresh } = useClub();
  const navigate = useNavigate();
  const [clubs, setClubs] = useState<ClubRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedClub | null>(null);

  // Create-club form
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");

  useEffect(() => {
    if (created) return;
    if (memberships.some((m) => m.status === "approved")) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [memberships, navigate, created]);

  useEffect(() => {
    supabase.from("clubs").select("id, club_name, address").order("club_name").then(({ data }) => {
      setClubs(data ?? []);
    });
  }, []);

  const pendingIds = new Set(memberships.filter((m) => m.status === "pending").map((m) => m.club_id));

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = z.object({
      name: z.string().trim().min(2).max(80),
      location: z.string().trim().max(120).optional(),
      description: z.string().trim().max(500).optional(),
      logo_url: z.string().trim().url().max(500).optional().or(z.literal("")),
      venue_name: z.string().trim().max(120).optional(),
      venue_address: z.string().trim().max(255).optional(),
    }).safeParse({
      name, location, description,
      logo_url: logoUrl, venue_name: venueName, venue_address: venueAddress,
    });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    if (!user) return;
    setBusy(true);
    const branding: Record<string, string> = {};
    if (parsed.data.description) branding.description = parsed.data.description;
    if (parsed.data.logo_url) branding.logo_url = parsed.data.logo_url;
    const { data: clubRow, error } = await supabase.from("clubs").insert({
      club_name: parsed.data.name,
      address: parsed.data.location || null,
      ...(Object.keys(branding).length > 0 ? { branding } : {}),
    }).select("id, club_name").single();
    if (error || !clubRow) { setBusy(false); toast.error(`Club insert failed: ${error?.message ?? "unknown error"}`); return; }

    const fullName: string = (user.user_metadata?.full_name as string | undefined) ?? "";
    const spaceIdx = fullName.indexOf(" ");
    const firstName = spaceIdx > 0 ? fullName.slice(0, spaceIdx) : fullName || "Unknown";
    const lastName = spaceIdx > 0 ? fullName.slice(spaceIdx + 1) : "Unknown";
    const { data: existingMemberProfile } = await supabase.from("members").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (!existingMemberProfile) {
      const { error: memberProfileError } = await supabase.from("members").insert({
        club_id: clubRow.id,
        auth_user_id: user.id,
        first_name: firstName,
        last_name: lastName,
        email: user.email ?? "",
      });
      if (memberProfileError) { setBusy(false); toast.error(`Member profile insert failed: ${memberProfileError.message}`); return; }
    }

    const { error: memberError } = await supabase.from("club_memberships").insert({
      user_id: user.id,
      club_id: clubRow.id,
      status: "approved",
      role: "owner",
      is_primary_club: true,
      approved_at: new Date().toISOString(),
      approved_by: user.id,
      joined_at: new Date().toISOString(),
    });
    if (memberError) { setBusy(false); toast.error(`Membership insert failed: ${memberError.message}`); return; }

    const { error: roleError } = await supabase.from("user_roles").insert({
      user_id: user.id,
      club_id: clubRow.id,
      role: "owner",
    });
    if (roleError) { setBusy(false); toast.error(`Role insert failed: ${roleError.message}`); return; }

    if (parsed.data.venue_name) {
      const { error: locError } = await supabase.from("locations").insert({
        club_id: clubRow.id,
        name: parsed.data.venue_name,
        address: parsed.data.venue_address || null,
        created_by: user.id,
      });
      if (locError) toast.error(`Location insert failed: ${locError.message}`);
    }

    const code = generateInviteCode();
    const { error: codeError } = await supabase.from("club_invite_codes").insert({
      club_id: clubRow.id,
      code,
      created_by: user.id,
      active: true,
    });
    setBusy(false);
    if (codeError) { toast.error(`Invite code insert failed: ${codeError.message}`); return; }
    toast.success("Club created — you're the owner.");
    await refresh();
    setCreated({ id: clubRow.id, name: clubRow.club_name, inviteCode: code });
  };

  const onRequestToJoin = async (clubId: string) => {
    if (!user) return;
    setBusy(true);
    const { data: existing } = await supabase
      .from("club_memberships")
      .select("status")
      .eq("user_id", user.id)
      .eq("club_id", clubId)
      .maybeSingle();
    let error = null;
    if (!existing) {
      const res = await supabase.from("club_memberships").insert({
        user_id: user.id, club_id: clubId, status: "pending", role: "member",
      });
      error = res.error;
    } else if (existing.status === "rejected") {
      const res = await supabase
        .from("club_memberships")
        .update({ status: "pending" })
        .eq("user_id", user.id)
        .eq("club_id", clubId);
      error = res.error;
    }
    if (!error) {
      // Ensure a members row exists so the admin's Pending tab can show this request
      const { data: existingMember } = await supabase
        .from("members")
        .select("id")
        .eq("auth_user_id", user.id)
        .eq("club_id", clubId)
        .maybeSingle();
      if (!existingMember) {
        const fullName: string = (user.user_metadata?.full_name as string | undefined) ?? "";
        const spaceIdx = fullName.indexOf(" ");
        const firstName = spaceIdx > 0 ? fullName.slice(0, spaceIdx) : fullName || null;
        const lastName = spaceIdx > 0 ? fullName.slice(spaceIdx + 1) : null;
        await supabase.from("members").insert({
          club_id: clubId,
          auth_user_id: user.id,
          first_name: firstName,
          last_name: lastName,
          email: user.email ?? "",
          membership_status: "pending",
        });
      }
    }
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Request sent! A coach or admin will approve you shortly.");
    await refresh();
  };

  if (created) {
    return (
      <CoachInvitePanel
        club={created}
        onContinue={() => navigate({ to: "/dashboard", replace: true })}
      />
    );
  }

  const defaultTab = typeof window !== "undefined" && sessionStorage.getItem("new_club_intent") === "1" ? "create" : "find";

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-white border-b safe-top px-6 pt-10 pb-6">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Waves className="h-5 w-5 text-primary" />
            </div>
            <div className="font-semibold text-foreground">IRB Coaching</div>
          </div>
          <button onClick={signOut} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
        <div className="max-w-2xl mx-auto mt-6">
          <h1 className="text-2xl font-bold text-foreground">Get started</h1>
          <p className="mt-1 text-sm text-muted-foreground">Find your club or create a new one.</p>
        </div>
      </div>

      <div className="px-4 mt-6 max-w-2xl mx-auto pb-10 space-y-4">
        {memberships.some((m) => m.status === "pending") && (
          <Card className="p-4 border-accent/40 bg-accent/5 rounded-xl">
            <div className="flex items-start gap-3">
              <UserCog className="h-5 w-5 text-accent shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium">Get a head start</div>
                <p className="text-sm text-muted-foreground">
                  Your request is being reviewed. Finish your profile now so you can start using the app the moment you're approved.
                </p>
              </div>
            </div>
            <Button asChild size="sm" className="mt-3 w-full">
              <Link to="/onboarding/profile">Complete my profile</Link>
            </Button>
          </Card>
        )}
        <Card className="p-4 rounded-xl border">
          <Tabs defaultValue={defaultTab}>
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="find">Find a club</TabsTrigger>
              <TabsTrigger value="create">Create a club</TabsTrigger>
            </TabsList>

            <TabsContent value="find" className="mt-4 space-y-2">
              {clubs.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No clubs yet. Create the first one.
                </p>
              )}
              {clubs.map((c) => {
                const pending = pendingIds.has(c.id);
                return (
                  <Card key={c.id} className="flex items-center justify-between rounded-xl border p-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{c.club_name}</div>
                      {c.address && <div className="text-xs text-muted-foreground truncate">{c.address}</div>}
                    </div>
                    {pending ? (
                      <span className="text-xs flex items-center gap-1 text-warning-foreground bg-warning/30 px-2.5 py-1 rounded-full shrink-0">
                        <Clock className="h-3 w-3" /> Request pending
                      </span>
                    ) : (
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => onRequestToJoin(c.id)} className="shrink-0">
                        Request to join
                      </Button>
                    )}
                  </Card>
                );
              })}
              {memberships.some((m) => m.status === "pending") && (
                <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  Request sent. You'll get access once an admin approves you.
                </p>
              )}
            </TabsContent>

            <TabsContent value="create" className="mt-4">
              <form onSubmit={onCreate} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Club name</Label>
                  <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Bondi SLSC" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="loc">Location</Label>
                  <Input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Sydney, NSW" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="desc">Description</Label>
                  <Textarea id="desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A few words about the club, training days, etc." />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="logo">Logo URL <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input id="logo" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…/logo.png" />
                </div>

                <div className="rounded-xl border bg-muted/30 p-3 space-y-3">
                  <div className="text-sm font-medium">Primary venue <span className="text-muted-foreground font-normal">(optional)</span></div>
                  <p className="text-xs text-muted-foreground -mt-1">
                    Saved as a location you can pick when creating sessions or carpool stops.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="venueName">Venue name</Label>
                    <Input id="venueName" value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="Miami Pool" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="venueAddress">Address</Label>
                    <Input id="venueAddress" value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} placeholder="80 Pacific Ave, Miami QLD 4220" />
                  </div>
                </div>

                <Button type="submit" disabled={busy} className="w-full h-11">Create club</Button>
                <p className="text-xs text-muted-foreground text-center">
                  You'll get a shareable invite link next so you can ask a coach to help set things up.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}

function CoachInvitePanel({
  club, onContinue,
}: { club: CreatedClub; onContinue: () => void }) {
  const inviteLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/signup?invite=${encodeURIComponent(club.inviteCode)}`
      : `/signup?invite=${club.inviteCode}`;
  const subject = `Help me set up ${club.name} on IRB Coaching`;
  const body =
    `Hi,\n\nI just set up ${club.name} on IRB Coaching and would love your help getting it ready.\n\n` +
    `Join using this link:\n${inviteLink}\n\n` +
    `Or sign up and enter the invite code: ${club.inviteCode}\n\nThanks!`;

  const copy = async (text: string, label = "Copied to clipboard") => {
    try { await navigator.clipboard.writeText(text); toast.success(label); }
    catch { toast.error("Could not copy"); }
  };

  const share = async () => {
    const data = { title: subject, text: body, url: inviteLink };
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try { await nav.share(data); return; } catch { /* user cancelled */ }
    }
    copy(inviteLink, "Link copied — paste it to your coach");
  };

  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-white border-b safe-top px-6 pt-10 pb-6">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center">
            <CheckCircle2 className="h-5 w-5 text-success" />
          </div>
          <div className="font-semibold text-foreground">{club.name} is ready</div>
        </div>
        <div className="max-w-2xl mx-auto mt-6">
          <h1 className="text-2xl font-bold text-foreground">Invite a coach to help set up</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Share this link with a coach. When they sign up and enter the invite code, you can promote them to coach from the Members page.
          </p>
        </div>
      </div>

      <div className="px-4 mt-6 max-w-2xl mx-auto pb-10 space-y-4">
        <Card className="p-4 space-y-3 rounded-xl border">
          <div className="flex items-center gap-2">
            <Ticket className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">Invite code</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 font-mono text-base tracking-wider rounded-md border bg-muted/40 px-3 py-2">
              {club.inviteCode}
            </div>
            <Button size="icon" variant="outline" onClick={() => copy(club.inviteCode, "Code copied")} aria-label="Copy code">
              <Copy className="h-4 w-4" />
            </Button>
          </div>

          <div className="text-sm font-semibold pt-2">Shareable link</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 truncate text-xs rounded-md border bg-muted/40 px-3 py-2">
              {inviteLink}
            </div>
            <Button size="icon" variant="outline" onClick={() => copy(inviteLink, "Link copied")} aria-label="Copy link">
              <Copy className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button variant="secondary" onClick={share}>
              <Share2 className="h-4 w-4 mr-1.5" /> Share
            </Button>
            <Button variant="secondary" asChild>
              <a href={mailto}><Mail className="h-4 w-4 mr-1.5" /> Email</a>
            </Button>
          </div>
        </Card>

        <Card className="p-4 text-sm text-muted-foreground space-y-1 rounded-xl border">
          <div className="font-medium text-foreground">What's next</div>
          <ul className="list-disc pl-5 space-y-1">
            <li>Add more saved locations from Settings → Saved locations.</li>
            <li>Create your first session from the Sessions tab.</li>
            <li>When your coach joins, open Members and promote them to Coach.</li>
          </ul>
        </Card>

        <Button onClick={onContinue} className="w-full h-11">Continue to dashboard</Button>
      </div>
    </div>
  );
}
