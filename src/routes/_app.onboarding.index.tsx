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
import { Waves, LogOut, CheckCircle2, Copy, Mail, Share2, Ticket, UserCog } from "lucide-react";
import { toast } from "sonner";
import { SupportRequestDialog } from "@/components/SupportRequestDialog";
import { AddressAutocomplete } from "@/components/settings/AddressAutocomplete";
import { LocationPicker } from "@/components/LocationPicker";

export const Route = createFileRoute("/_app/onboarding/")({
  head: () => ({ meta: [{ title: "Get started — IRB Coaching" }] }),
  validateSearch: (search: Record<string, unknown>): { add?: boolean } => {
    const a = search.add;
    return { add: a === true || a === "1" || a === "true" || a === 1 };
  },
  component: Onboarding,
});

type CreatedClub = { id: string; name: string; inviteCode: string };

function Onboarding() {
  const { user, signOut } = useAuth();
  const { memberships, refresh } = useClub();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedClub | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");

  // Create-club form
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");

  useEffect(() => {
    if (created || search.add) return;
    if (memberships.some((m) => m.status === "approved")) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [memberships, navigate, created, search.add]);

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

    const fullName: string = (user.user_metadata?.full_name as string | undefined) ?? "";
    const spaceIdx = fullName.indexOf(" ");
    const firstName = spaceIdx > 0 ? fullName.slice(0, spaceIdx) : fullName || "Unknown";
    const lastName = spaceIdx > 0 ? fullName.slice(spaceIdx + 1) : "Unknown";

    const { data, error } = await supabase.rpc("create_club", {
      p_name: parsed.data.name,
      p_first_name: firstName,
      p_last_name: lastName,
      p_email: user.email ?? "",
      p_address: parsed.data.location || null,
      p_description: parsed.data.description || null,
      p_logo_url: parsed.data.logo_url || null,
      p_venue_name: parsed.data.venue_name || null,
      p_venue_address: parsed.data.venue_address || null,
    });
    setBusy(false);
    if (error || !data) { toast.error(`Club creation failed: ${error?.message ?? "unknown error"}`); return; }
    const result = data as { club_id: string; club_name: string; invite_code: string };
    toast.success("Club created — you're the owner.");
    await refresh();
    setCreated({ id: result.club_id, name: result.club_name, inviteCode: result.invite_code });
  };

  const redeemInviteCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !joinCode.trim()) return;
    setBusy(true);
    const { error } = await supabase.rpc("redeem_club_invite_code", { _code: joinCode.trim().toUpperCase() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("You've joined the club!");
    setJoinCode("");
    await refresh();
    navigate({ to: "/dashboard", replace: true });
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
          {search.add && (
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-2"
            >
              ← Back
            </Link>
          )}
          <h1 className="text-2xl font-bold text-foreground">
            {search.add ? "Join or create another club" : "Get started"}
          </h1>
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

            <TabsContent value="find" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Enter your invite code to join a club. Ask a coach or admin at your club for the code.
              </p>
              <form onSubmit={redeemInviteCode} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="join-code">Invite code</Label>
                  <Input
                    id="join-code"
                    required
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="IRB-XXXXXXXX"
                    className="h-11 font-mono tracking-widest text-center"
                  />
                </div>
                <Button type="submit" disabled={busy || !joinCode.trim()} className="w-full h-11">
                  {busy ? "Joining…" : "Join club"}
                </Button>
              </form>
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
                  <AddressAutocomplete id="loc" value={location} onChange={setLocation} placeholder="Sydney, NSW" />
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
                    <LocationPicker id="venueAddress" clubId={null} value={venueAddress} onChange={setVenueAddress} placeholder="80 Pacific Ave, Miami QLD 4220" />
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

        <button
          type="button"
          onClick={() => setSupportOpen(true)}
          className="w-full text-sm text-muted-foreground hover:text-foreground text-center py-1"
        >
          Need help?
        </button>
        <SupportRequestDialog open={supportOpen} onOpenChange={setSupportOpen} />
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
