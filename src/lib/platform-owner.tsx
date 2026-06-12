import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

/**
 * Client-side hook to check whether the signed-in user is a platform owner.
 * UI gating only — the RPCs and RLS policies are the real authority.
 */
export function useIsPlatformOwner() {
  const { user } = useAuth();
  const [isOwner, setIsOwner] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) { setIsOwner(false); return; }
    let cancelled = false;
    supabase
      .from("platform_owners")
      .select("user_id", { head: true, count: "exact" })
      .eq("user_id", user.id)
      .then(({ count }) => { if (!cancelled) setIsOwner((count ?? 0) > 0); });
    return () => { cancelled = true; };
  }, [user?.id]);

  return isOwner;
}
