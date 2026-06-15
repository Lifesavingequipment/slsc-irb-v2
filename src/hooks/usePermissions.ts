import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useClub } from "@/lib/club-context";

export type PermissionKey =
  | "view_medical_info"
  | "edit_sessions"
  | "delete_sessions"
  | "create_sessions"
  | "view_member_profiles"
  | "edit_templates"
  | "delete_templates"
  | "manage_gear"
  | "manage_wave_draw"
  | "manage_carpool";

const ROLE_RANK: Record<string, number> = {
  club_admin: 4,
  coach: 3,
  assistant_coach: 2,
  member: 1,
};

function highestRole(roles: string[]): string {
  return roles.reduce(
    (best, r) => (ROLE_RANK[r] ?? 0) > (ROLE_RANK[best] ?? 0) ? r : best,
    "member",
  );
}

interface PermissionsState {
  isOwner: boolean;
  isClubAdmin: boolean;
  hasPermission: (p: PermissionKey) => boolean;
  loading: boolean;
}

const EMPTY: PermissionsState = {
  isOwner: false,
  isClubAdmin: false,
  hasPermission: () => false,
  loading: true,
};

export function usePermissions(): PermissionsState {
  const { user } = useAuth();
  const { activeClub, isPlatformOwner } = useClub();
  const [state, setState] = useState<PermissionsState>(EMPTY);
  const cacheRef = useRef<{ clubId: string; role: string; perms: Record<string, boolean> } | null>(null);

  useEffect(() => {
    if (!user || !activeClub) {
      setState({ ...EMPTY, loading: false });
      return;
    }

    const clubId = activeClub.club_id;
    const roles = activeClub.roles;
    const isClubAdmin = roles.some((r) => r === "owner" || r === "club_admin");
    const role = highestRole(roles);

    if (isPlatformOwner || isClubAdmin) {
      setState({
        isOwner: isPlatformOwner,
        isClubAdmin: true,
        hasPermission: () => true,
        loading: false,
      });
      return;
    }

    // Use cache if same club+role
    if (cacheRef.current?.clubId === clubId && cacheRef.current?.role === role) {
      const cached = cacheRef.current.perms;
      setState({
        isOwner: false,
        isClubAdmin: false,
        hasPermission: (p) => !!cached[p],
        loading: false,
      });
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    supabase
      .from("club_permissions")
      .select("permission, enabled")
      .eq("club_id", clubId)
      .eq("role", role)
      .then(({ data }) => {
        if (cancelled) return;
        const perms: Record<string, boolean> = {};
        (data ?? []).forEach((row) => { perms[row.permission] = row.enabled; });
        cacheRef.current = { clubId, role, perms };
        setState({
          isOwner: false,
          isClubAdmin: false,
          hasPermission: (p) => !!perms[p],
          loading: false,
        });
      });

    return () => { cancelled = true; };
  }, [user?.id, activeClub?.club_id, activeClub?.roles.join(","), isPlatformOwner]);

  return state;
}
