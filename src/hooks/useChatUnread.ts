import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useChatUnread(): number {
  const [unread, setUnread] = useState(0);

  const compute = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Load all member IDs across all clubs so the badge covers every club.
    const { data: members } = await supabase
      .from("members")
      .select("id")
      .eq("auth_user_id", user.id);

    if (!members || members.length === 0) { setUnread(0); return; }
    const allIds = members.map((m) => m.id);

    const { data: cm } = await supabase
      .from("chat_members")
      .select("channel_id, last_read_at")
      .in("member_id", allIds);

    if (!cm || cm.length === 0) { setUnread(0); return; }

    const counts = await Promise.all(
      cm
        .filter((r) => r.channel_id != null)
        .map((r) =>
          supabase
            .from("chat_messages")
            .select("id", { count: "exact", head: true })
            .eq("channel_id", r.channel_id as string)
            .gt("created_at", r.last_read_at ?? "1970-01-01")
            // Exclude messages sent by any of the user's member IDs
            .not("sender_id", "in", `(${allIds.join(",")})`),
        ),
    );
    const total = counts.reduce((sum, r) => sum + (r.count ?? 0), 0);
    setUnread(total);
  }, []);

  useEffect(() => { void compute(); }, [compute]);

  // Re-check every 30s as a lightweight fallback
  useEffect(() => {
    const t = setInterval(() => void compute(), 30000);
    return () => clearInterval(t);
  }, [compute]);

  return unread;
}
