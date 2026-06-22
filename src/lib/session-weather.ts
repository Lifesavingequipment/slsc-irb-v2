import { supabase } from "@/integrations/supabase/client";

// Fire-and-forget: fetch and cache a newly created session's tides right
// away, so the session detail page doesn't show blank tides until the 1am
// daily-tide-refresh cron runs. Best-effort — that cron backstops failures.
export async function prefetchSessionTides(sessionId: string) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-session-weather`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ session_id: sessionId, force_tides: true }),
    });
  } catch {
    // Best-effort — the 1am daily-tide-refresh cron backstops any failures.
  }
}
