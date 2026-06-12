import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Share2, Copy, UserPlus, Shield } from "lucide-react";
import { toast } from "sonner";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[bytes[i] % chars.length];
  return `IRB-${out}`;
}

async function ensureCode(clubId: string, currentUserId: string | null): Promise<string | null> {
  const { data } = await supabase
    .from("club_invite_codes")
    .select("code")
    .eq("club_id", clubId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1);
  if (data?.[0]?.code) return data[0].code as string;
  if (!currentUserId) return null;
  const code = generateCode();
  const { error } = await supabase
    .from("club_invite_codes")
    .insert({ club_id: clubId, code, created_by: currentUserId, active: true });
  if (error) {
    toast.error(error.message);
    return null;
  }
  return code;
}

export function InviteShareCard({
  clubId,
  clubName,
  canManage,
  isAdmin,
  currentUserId,
}: {
  clubId: string;
  clubName?: string;
  canManage: boolean;
  isAdmin: boolean;
  currentUserId: string | null;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("club_invite_codes")
      .select("code")
      .eq("club_id", clubId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1);
    setCode((data?.[0]?.code as string | undefined) ?? null);
  }, [clubId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!canManage) return null;

  const buildLink = (c: string) =>
    `${typeof window !== "undefined" ? window.location.origin : ""}/signup?invite=${encodeURIComponent(c)}`;

  const share = async (audience: "member" | "coach") => {
    setBusy(true);
    const c = code ?? (await ensureCode(clubId, currentUserId));
    setBusy(false);
    if (!c) return;
    if (!code) setCode(c);
    const link = buildLink(c);
    const title = audience === "coach" ? "Join as a coach" : "Join the club";
    const text =
      audience === "coach"
        ? `You're invited to join ${clubName ?? "our club"} as a coach on IRB Coaching. Sign up here:`
        : `You're invited to join ${clubName ?? "our club"} on IRB Coaching. Sign up here:`;
    const shareData = { title, text, url: link };
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch {
      // user cancelled or share failed — fall through to clipboard
    }
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Invite link copied to clipboard");
    } catch {
      toast.error("Could not copy link");
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Share2 className="h-4 w-4 text-primary" />
        <div className="text-sm font-semibold">Invite to {clubName ?? "your club"}</div>
      </div>
      <p className="text-xs text-muted-foreground">
        Share a sign-up link with new people. They'll be added to the club after signing up.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          size="sm"
          className="flex-1"
          disabled={busy}
          onClick={() => share("member")}
        >
          <UserPlus className="h-4 w-4 mr-1.5" /> Share member sign-up link
        </Button>
        {isAdmin && (
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={() => share("coach")}
          >
            <Shield className="h-4 w-4 mr-1.5" /> Share coach sign-up link
          </Button>
        )}
      </div>
      {code && (
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(buildLink(code));
              toast.success("Link copied");
            } catch {
              toast.error("Could not copy");
            }
          }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Copy className="h-3 w-3" /> Copy link
        </button>
      )}
    </Card>
  );
}
