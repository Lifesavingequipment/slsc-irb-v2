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
  const { memberships } = useClub();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [allMemberIds, setAllMemberIds] = useState<string[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Load all member records across all clubs.
    const { data: members } = await supabase
      .from("members")
      .select("id")
      .eq("auth_user_id", user.id);

    if (!members || members.length === 0) return;
    const ids = members.map((m) => m.id);
    setAllMemberIds(ids);

    const { data, error } = await supabase
      .from("notifications")
      .select("id, club_id, member_id, message, notification_type, related_id, is_read, created_at")
      .in("member_id", ids)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) console.error("[useNotifications] fetch error", error);
    setNotifications((data ?? []) as AppNotification[]);
  }, []);

  // Reload when the number of club memberships changes (user joined/left a club).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load, memberships.length]);

  useEffect(() => {
    if (!allMemberIds.length) return;

    let cancelled = false;

    // Nuclear clear: remove every channel from the client registry before
    // creating a new one. This prevents "cannot add postgres_changes callbacks
    // after subscribe()" when club membership changes and the old channel is
    // still registered.
    void supabase.removeAllChannels().then(() => {
      channelRef.current = null;
      if (cancelled) return;

      setTimeout(() => {
        if (cancelled) return;

        const channelName = `notifications:all:${Date.now()}`;
        channelRef.current = supabase
          .channel(channelName)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "notifications",
              // No server-side filter — RLS governs access.
              // We filter client-side to only add notifications for our member IDs.
            },
            (payload) => {
              const notif = payload.new as AppNotification;
              if (allMemberIds.includes(notif.member_id ?? "")) {
                setNotifications((prev) => [notif, ...prev]);
              }
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
  }, [allMemberIds]);

  const markAllRead = useCallback(async () => {
    if (!allMemberIds.length) return;
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .in("member_id", allMemberIds)
      .eq("is_read", false);
    if (error) {
      console.error("[useNotifications] markAllRead error", error);
      return;
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }, [allMemberIds]);

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
