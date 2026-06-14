import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClub } from "@/lib/club-context";

export type AppNotification = {
  id: string;
  club_id: string | null;
  member_id: string | null;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export function useNotifications() {
  const { activeClub } = useClub();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [memberId, setMemberId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeClub) return;
    const { data: { user } } = await supabase.auth.getUser();
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
      .select("*")
      .eq("member_id", m.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setNotifications((data ?? []) as AppNotification[]);
  }, [activeClub]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!memberId) return;
    const channel = supabase
      .channel(`notifications:${memberId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `member_id=eq.${memberId}` },
        (payload) => { setNotifications((prev) => [payload.new as AppNotification, ...prev]); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [memberId]);

  const markAllRead = useCallback(async () => {
    if (!memberId) return;
    const now = new Date().toISOString();
    await supabase
      .from("notifications")
      .update({ read_at: now })
      .eq("member_id", memberId)
      .is("read_at", null);
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })));
  }, [memberId]);

  const markRead = useCallback(async (id: string) => {
    const now = new Date().toISOString();
    await supabase.from("notifications").update({ read_at: now }).eq("id", id).is("read_at", null);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read_at: n.read_at ?? now } : n));
  }, []);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return { notifications, unreadCount, markAllRead, markRead };
}
