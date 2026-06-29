import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  User, Mail, KeyRound, Bell, Building2, MapPin, ShieldAlert, MessageSquare,
  PlusCircle, LogOut, Users, ChevronRight, RefreshCw, Copy, Check, MessageSquareText, ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useClub, useCanManage, useIsAdmin, useIsGuardian } from "@/lib/club-context";
import { useAuth } from "@/lib/auth-context";
import { signOutAndRedirect } from "@/lib/sign-out";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/more")({
  head: () => ({ meta: [{ title: "More — IRB Coaching" }] }),
  component: MorePage,
});

function SectionHeader({ children }: { children: string }) {
  return (
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-5 pb-1">
      {children}
    </p>
  );
}

function MoreRow({ icon: Icon, iconBg, label, sublabel, to, search, onClick, destructive }: {
  icon: typeof Users;
  iconBg: string;
  label: string;
  sublabel?: string;
  to?: string;
  search?: Record<string, unknown>;
  onClick?: () => void;
  destructive?: boolean;
}) {
  const content = (
    <>
      <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <span className={`block font-medium text-sm ${destructive ? "text-destructive" : ""}`}>{label}</span>
        {sublabel && <span className="block text-xs text-muted-foreground truncate">{sublabel}</span>}
      </div>
      {!destructive && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
    </>
  );
  const className = "w-full h-14 flex items-center gap-3 px-4 active:bg-muted/50 transition-colors text-left";
  if (to) {
    return (
      <Link to={to} search={search} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

function buildInviteMessage(code: string): string {
  return `Welcome to IRB Training App
Link: https://slsc-irb-v2.vercel.app
Invite code: ${code}

Download to iPhone
1. Open the link in Safari (must be Safari, not Chrome)
2. Tap the Share button (box with arrow at bottom of screen)
3. Tap "Add to Home Screen"
4. Name it "IRB Training" → tap Add
5. App icon appears on your home screen.

Download to Android
1. Open the link in Chrome
2. Tap the three dots menu (top right)
3. Tap "Add to Home Screen"
4. Tap Add
5. App icon appears on your home screen.`;
}

function InviteCodeRow() {
  const { activeClub } = useClub();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmingRegen, setConfirmingRegen] = useState(false);

  useEffect(() => {
    if (!activeClub) { setCode(null); return; }
    supabase
      .from("club_invite_codes")
      .select("code")
      .eq("club_id", activeClub.club_id)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setCode(data?.code ?? null));
  }, [activeClub?.club_id]);

  const copyCode = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyInviteMessage = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(buildInviteMessage(code));
    toast.success("Invite message copied!");
  };

  const regenerate = async () => {
    if (!activeClub) return;
    setBusy(true);
    await supabase.from("club_invite_codes").update({ active: false }).eq("club_id", activeClub.club_id);
    const newCode = "IRB-" + Math.random().toString(36).substring(2, 10).toUpperCase();
    const { data, error } = await supabase
      .from("club_invite_codes")
      .insert({ club_id: activeClub.club_id, code: newCode, active: true })
      .select("code")
      .single();
    setBusy(false);
    setConfirmingRegen(false);
    if (error) { toast.error(error.message); return; }
    setCode(data?.code ?? newCode);
    toast.success("New invite code generated");
  };

  return (
    <div>
      <MoreRow icon={Copy} iconBg="bg-pink-500" label="Invite Code" onClick={() => setOpen((v) => !v)} />
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex-1 bg-muted rounded-lg px-3 py-2.5 font-mono text-sm font-semibold tracking-widest text-center">
              {code ?? "—"}
            </span>
            <button
              type="button"
              onClick={copyCode}
              disabled={!code}
              className="h-10 w-10 rounded-lg border flex items-center justify-center shrink-0 disabled:opacity-50"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          {confirmingRegen ? (
            <div className="flex items-center gap-2">
              <p className="flex-1 text-xs text-muted-foreground">Invalidate the old code and generate a new one?</p>
              <button
                type="button"
                onClick={() => setConfirmingRegen(false)}
                className="text-xs font-medium px-2.5 py-1.5 rounded-md border"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={regenerate}
                disabled={busy}
                className="text-xs font-medium px-2.5 py-1.5 rounded-md border border-destructive text-destructive disabled:opacity-50"
              >
                {busy ? "Generating…" : "Confirm"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingRegen(true)}
              className="text-xs font-medium px-2.5 py-1.5 rounded-md border inline-flex items-center gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Regenerate
            </button>
          )}
          <button
            type="button"
            onClick={copyInviteMessage}
            disabled={!code}
            className="w-full text-xs font-medium px-2.5 py-1.5 rounded-md border inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <MessageSquareText className="h-3.5 w-3.5" /> Copy invite message
          </button>
        </div>
      )}
    </div>
  );
}

function MorePage() {
  const { user } = useAuth();
  const canManage = useCanManage();
  const isAdmin = useIsAdmin();
  const isGuardian = useIsGuardian();
  const showClubSection = canManage && !isGuardian;

  const fullName = (user?.user_metadata?.full_name as string | undefined)?.trim() || "More";
  const firstName = fullName.split(/\s+/)[0];

  return (
    <AppShell>
      <div className="pb-8">
        <p className="text-muted-foreground text-sm px-1">Hi, {firstName} 👋</p>

        <SectionHeader>Your Account</SectionHeader>
        <MoreRow icon={User} iconBg="bg-blue-500" label="Profile" to="/settings" search={{ section: "profile" }} />
        <MoreRow icon={Mail} iconBg="bg-green-500" label="Email" to="/settings" search={{ section: "email" }} />
        <MoreRow icon={KeyRound} iconBg="bg-orange-500" label="Password" to="/settings" search={{ section: "password" }} />
        <MoreRow icon={Bell} iconBg="bg-purple-500" label="Notifications" to="/settings" search={{ section: "notifications" }} />

        {showClubSection && (
          <>
            <SectionHeader>Your Club</SectionHeader>
            {isAdmin && (
              <MoreRow icon={Building2} iconBg="bg-indigo-500" label="Club Information" to="/settings" search={{ section: "clubs" }} />
            )}
            <MoreRow icon={MapPin} iconBg="bg-teal-500" label="Saved Locations" to="/settings" search={{ section: "locations" }} />
            <MoreRow icon={ShieldAlert} iconBg="bg-red-500" label="Roles & Permissions" to="/settings/roles" />
            <MoreRow icon={RefreshCw} iconBg="bg-yellow-500" label="Templates" to="/settings/templates" />
            <MoreRow icon={ListChecks} iconBg="bg-emerald-500" label="Gear Lists" to="/more/gear-lists" />
            {isAdmin && <InviteCodeRow />}
          </>
        )}

        {showClubSection && (
          <>
            <SectionHeader>Members</SectionHeader>
            <MoreRow icon={Users} iconBg="bg-slate-500" label="Members" to="/members" />
          </>
        )}

        <SectionHeader>Other</SectionHeader>
        <MoreRow icon={PlusCircle} iconBg="bg-gray-500" label="Join or create another club" to="/onboarding" search={{ add: 1 }} />
        <MoreRow icon={MessageSquare} iconBg="bg-gray-400" label="Send Feedback" to="/settings" search={{ section: "feedback" }} />

        <div className="mt-4 border-t pt-1">
          <MoreRow icon={LogOut} iconBg="bg-red-500" label="Logout" onClick={() => void signOutAndRedirect()} destructive />
        </div>
      </div>
    </AppShell>
  );
}
