import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClub } from "@/lib/club-context";

export function useChatUnread(): number {
  const { activeClub } = useClub();
  const [unread, setUnread] = useState(0);

  const compute = useCallback(async () => {
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

    const { data: cm } = await supabase
      .from("chat_members")
      .select("channel_id, last_read_at")
      .eq("member_id", m.id);
    if (!cm || cm.length === 0) { setUnread(0); return; }

    const counts = await Promise.all(
      cm.map((r) =>
        supabase
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("channel_id", r.channel_id)
          .gt("created_at", r.last_read_at ?? "1970-01-01")
          .neq("sender_id", m.id)
      )
    );
    const total = counts.reduce((sum, r) => sum + (r.count ?? 0), 0);
    setUnread(total);
  }, [activeClub]);

  useEffect(() => { void compute(); }, [compute]);

  // Re-check every 30s as a lightweight fallback
  useEffect(() => {
    const t = setInterval(() => void compute(), 30000);
    return () => clearInterval(t);
  }, [compute]);

  return unread;
}
