import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useClub } from "@/lib/club-context";

export function useMemberFirstName(): string | null {
  const { user } = useAuth();
  const { activeClub } = useClub();
  const [firstName, setFirstName] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !activeClub) { setFirstName(null); return; }
    supabase
      .from("members")
      .select("first_name")
      .eq("auth_user_id", user.id)
      .eq("club_id", activeClub.club_id)
      .maybeSingle()
      .then(({ data }) => setFirstName(data?.first_name ?? null));
  }, [user?.id, activeClub?.club_id]);

  return firstName;
}
