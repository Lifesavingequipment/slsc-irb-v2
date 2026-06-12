import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth-context";

export interface ClubMembership {
  club_id: string;
  status: "pending" | "approved" | "rejected";
  club: { id: string; name: string; location: string | null };
  roles: ("owner" | "club_admin" | "coach" | "member")[];
}

interface ClubContextValue {
  memberships: ClubMembership[];
  activeClub: ClubMembership | null;
  setActiveClubId: (id: string) => void;
  loading: boolean;
  isPlatformOwner: boolean;
  refresh: () => Promise<void>;
}

const ClubContext = createContext<ClubContextValue | undefined>(undefined);

const ACTIVE_KEY = "irb_active_club_id";

export function ClubProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [memberships, setMemberships] = useState<ClubMembership[]>([]);
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(
    typeof window !== "undefined" ? localStorage.getItem(ACTIVE_KEY) : null,
  );
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) {
      setMemberships([]);
      setIsPlatformOwner(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: mems }, { data: roles }, { count: poCount }] = await Promise.all([
      supabase
        .from("club_memberships")
        .select("club_id, status, club:clubs(id, name:club_name, location:state_region)")
        .eq("user_id", user.id),
      supabase.from("user_roles").select("club_id, role").eq("user_id", user.id),
      supabase
        .from("platform_owners")
        .select("user_id", { head: true, count: "exact" })
        .eq("user_id", user.id),
    ]);
    const list: ClubMembership[] = (mems ?? [])
      .filter((m) => m.club)
      .map((m) => ({
        club_id: m.club_id,
        status: m.status as ClubMembership["status"],
        club: m.club as ClubMembership["club"],
        roles: (roles ?? [])
          .filter((r) => r.club_id === m.club_id)
          .map((r) => r.role as ClubMembership["roles"][number]),
      }));
    setMemberships(list);
    setIsPlatformOwner((poCount ?? 0) > 0);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const approved = memberships.filter((m) => m.status === "approved");
  const activeClub =
    approved.find((m) => m.club_id === activeId) ?? approved[0] ?? null;

  const setActiveClubId = (id: string) => {
    setActiveId(id);
    if (typeof window !== "undefined") localStorage.setItem(ACTIVE_KEY, id);
  };

  useEffect(() => {
    if (activeClub && activeClub.club_id !== activeId) {
      setActiveClubId(activeClub.club_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClub?.club_id]);

  return (
    <ClubContext.Provider
      value={{ memberships, activeClub, setActiveClubId, loading, isPlatformOwner, refresh: load }}
    >
      {children}
    </ClubContext.Provider>
  );
}

export function useClub() {
  const ctx = useContext(ClubContext);
  if (!ctx) throw new Error("useClub must be used within ClubProvider");
  return ctx;
}

export function useCanManage() {
  const { activeClub, isPlatformOwner } = useClub();
  if (isPlatformOwner) return true;
  if (!activeClub) return false;
  return activeClub.roles.some((r) => r === "owner" || r === "club_admin" || r === "coach");
}

export function useIsAdmin() {
  const { activeClub, isPlatformOwner } = useClub();
  if (isPlatformOwner) return true;
  if (!activeClub) return false;
  return activeClub.roles.some((r) => r === "owner" || r === "club_admin");
}
