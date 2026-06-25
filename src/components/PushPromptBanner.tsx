import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { useClub } from "@/lib/club-context";
import { supabase } from "@/integrations/supabase/client";
import { enablePushNotifications } from "@/lib/push";
import { toast } from "sonner";

const DISMISSED_KEY = "push_prompt_dismissed";

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches;
}

function isUnsupportedIOS(): boolean {
  const ua = navigator.userAgent;
  if (!/iPhone|iPad|iPod/.test(ua)) return false;
  // Safari on iOS — extract major version
  const match = ua.match(/OS (\d+)_/);
  const major = match ? parseInt(match[1], 10) : 0;
  return major < 16;
}

export function PushPromptBanner() {
  const { user } = useAuth();
  const { activeClub } = useClub();
  const [visible, setVisible] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || !activeClub) return;
    if (!isStandalone()) return;
    if (isUnsupportedIOS()) return;
    if (localStorage.getItem(DISMISSED_KEY) === "true") return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") return;

    // Check if already subscribed
    supabase
      .from("push_subscriptions")
      .select("id")
      .eq("member_id", "" /* filled below */)
      .limit(1)
      .then(() => {}); // placeholder — resolve memberId first

    supabase
      .from("members")
      .select("id")
      .eq("auth_user_id", user.id)
      .eq("club_id", activeClub.club_id)
      .single()
      .then(async ({ data: member }) => {
        if (!member) return;
        setMemberId(member.id);

        const { data: subs } = await supabase
          .from("push_subscriptions")
          .select("id")
          .eq("member_id", member.id)
          .limit(1);

        if (!subs || subs.length === 0) {
          setVisible(true);
        }
      });
  }, [user, activeClub]);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "true");
    setVisible(false);
  }

  async function handleEnable() {
    if (!memberId || !activeClub) return;
    setLoading(true);
    try {
      await enablePushNotifications(memberId, activeClub.club_id);
      toast.success("Notifications enabled");
      setVisible(false);
    } catch {
      const perm = Notification.permission;
      if (perm === "denied") {
        localStorage.setItem(DISMISSED_KEY, "true");
        setVisible(false);
        toast.error("Notifications blocked — enable them in your browser settings");
      } else {
        toast.error("Could not enable notifications");
      }
    } finally {
      setLoading(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 mb-4 shadow-sm">
      <Bell className="h-4 w-4 text-muted-foreground shrink-0" />
      <p className="flex-1 text-sm text-muted-foreground leading-snug">
        Enable notifications to get session updates and messages
      </p>
      <Button size="sm" onClick={handleEnable} disabled={loading} className="shrink-0">
        Enable
      </Button>
      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={dismiss} aria-label="Dismiss">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
