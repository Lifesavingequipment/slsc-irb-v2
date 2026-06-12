import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, RefreshCw, Ticket } from "lucide-react";
import { toast } from "sonner";

type InviteCode = {
  id: string;
  code: string;
  active: boolean;
};

function generateCode(): string {
  // 8-char Crockford-base32-ish, no ambiguous chars.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[bytes[i] % chars.length];
  return `IRB-${out}`;
}

export function InviteCodeCard({
  clubId,
  canManage,
  currentUserId,
}: {
  clubId: string;
  canManage: boolean;
  currentUserId: string | null;
}) {
  const [code, setCode] = useState<InviteCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("club_invite_codes")
      .select("id, code, active")
      .eq("club_id", clubId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1);
    setCode((data?.[0] as InviteCode | undefined) ?? null);
    setLoading(false);
  }, [clubId]);

  useEffect(() => {
    load();
  }, [load]);

  const generate = async () => {
    if (!currentUserId) return;
    setBusy(true);
    // Deactivate any existing active codes for this club
    await supabase
      .from("club_invite_codes")
      .update({ active: false })
      .eq("club_id", clubId)
      .eq("active", true);
    const { error } = await supabase.from("club_invite_codes").insert({
      club_id: clubId,
      code: generateCode(),
      created_by: currentUserId,
      active: true,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("New invite code generated");
    load();
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.code);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy");
    }
  };

  if (loading) return null;
  if (!code && !canManage) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <Ticket className="h-4 w-4 text-primary" />
        <div className="text-sm font-semibold">Invite code</div>
      </div>
      {code ? (
        <>
          <div className="flex items-center gap-2">
            <div className="flex-1 font-mono text-base tracking-wider rounded-md border bg-muted/40 px-3 py-2">
              {code.code}
            </div>
            <Button size="icon" variant="outline" onClick={copy} aria-label="Copy code">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Share this code with new members. They can enter it on the sign-up page to join.
          </p>
          {canManage && (
            <Button
              size="sm"
              variant="ghost"
              className="mt-2 h-8"
              disabled={busy}
              onClick={generate}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Regenerate
            </Button>
          )}
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-3">
            No invite code yet. Generate one to let members self-register.
          </p>
          <Button size="sm" disabled={busy} onClick={generate}>
            <Ticket className="h-4 w-4 mr-1.5" /> Generate invite code
          </Button>
        </>
      )}
    </Card>
  );
}
