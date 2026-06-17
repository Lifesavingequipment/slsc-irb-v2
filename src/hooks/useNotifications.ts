import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClub } from "@/lib/club-context";

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
    const { data } = await supabase
      .from("notifications")
      .select("id, club_id, member_id, message, notification_type, related_id, is_read, created_at")
      .eq("member_id", m.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setNotifications((data ?? []) as AppNotification[]);
  }, [activeClub]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!memberId) return;
    const channel = supabase
      .channel(`notifications:${memberId}`)
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
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [memberId]);

  const markAllRead = useCallback(async () => {
    if (!memberId) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("member_id", memberId)
      .eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }, [memberId]);

  const markRead = useCallback(async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return { notifications, unreadCount, markAllRead, markRead };
}
