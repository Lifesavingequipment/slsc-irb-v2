import { supabase } from "@/integrations/supabase/client";

/**
 * Sign out and hard-redirect to /login so all in-memory caches are dropped
 * and the back button cannot restore the previous protected page.
 */
export async function signOutAndRedirect() {
  try {
    await supabase.auth.signOut();
  } catch {
    // ignore — we still want to send the user to /login
  }
  // Hard replace so back-button can't restore an authenticated screen.
  if (typeof window !== "undefined") {
    window.location.replace("/login");
  }
}
