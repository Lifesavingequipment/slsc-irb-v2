import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClub } from "@/lib/club-context";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type AppNotification = {
  id: string;
  club_id: string | null;
  member_id: string | null;
  notification_type: string;
  message: string;
  related_id: string | null;
  is_read: boolean | null;
  created_at: string;
};

export function useNotifications() {
  const { activeClub } = useClub();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [memberId, setMemberId] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const load = useCallback(async () => {
    if (!activeClub) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: m } = await supabase
      .from("members")
      .select("id")
      .eq("auth_user_id", user.id)
      .eq("club_id", activeClub.club_id)
      .maybeSingle();
    if (!m) return;
    setMemberId(m.id);
    const { data, error } = await supabase
      .from("notifications")
      .select("id, club_id, member_id, message, notification_type, related_id, is_read, created_at")
      .eq("member_id", m.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) console.error("[useNotifications] fetch error", error);
    console.log("[useNotifications] fetched", { memberId: m.id, count: data?.length ?? 0, data });
    setNotifications((data ?? []) as AppNotification[]);
  }, [activeClub]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!memberId) return;

    let cancelled = false;

    // Nuclear clear: remove every channel from the client registry before
    // creating a new one. This prevents "cannot add postgres_changes callbacks
    // after subscribe()" when a multi-club user switches clubs and the old
    // channel for the same member ID is still registered.
    void supabase.removeAllChannels().then(() => {
      channelRef.current = null;
      if (cancelled) return;

      // Brief pause so Supabase's internal registry finishes teardown.
      setTimeout(() => {
        if (cancelled) return;

        // Unique suffix prevents name collision with any lingering registrations.
        const channelName = `notifications:${memberId}:${Date.now()}`;
        channelRef.current = supabase
          .channel(channelName)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "notifications",
              filter: `member_id=eq.${memberId}`,
            },
            (payload) => {
              setNotifications((prev) => [payload.new as AppNotification, ...prev]);
            },
          )
          .subscribe();
      }, 50);
    });

    return () => {
      cancelled = true;
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [memberId]);

  const markAllRead = useCallback(async () => {
    if (!memberId) return;
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("member_id", memberId)
      .eq("is_read", false);
    if (error) {
      console.error("[useNotifications] markAllRead error", error);
      return;
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }, [memberId]);

  const markRead = useCallback(async (id: string) => {
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    if (error) {
      console.error("[useNotifications] markRead error", error);
      return;
    }
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return { notifications, unreadCount, markAllRead, markRead };
}
