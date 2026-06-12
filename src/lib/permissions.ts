// Pure permission helpers. These mirror the server-side RLS rules and are
// safe to use for UI gating. Server is the source of truth — these helpers
// should never be the only thing keeping data private.

export type ClubRole = "owner" | "club_admin" | "coach" | "member";
export type MembershipStatus = "pending" | "approved" | "rejected";

export interface MembershipLike {
  status: MembershipStatus;
  roles: ClubRole[];
}

export function isApproved(m: MembershipLike | null | undefined): boolean {
  return !!m && m.status === "approved";
}

export function isOwner(m: MembershipLike | null | undefined): boolean {
  return isApproved(m) && m!.roles.includes("owner");
}

export function isAdmin(m: MembershipLike | null | undefined): boolean {
  return isApproved(m) && m!.roles.some((r) => r === "owner" || r === "club_admin");
}

export function isCoach(m: MembershipLike | null | undefined): boolean {
  return isApproved(m) && m!.roles.includes("coach");
}

export function canManage(m: MembershipLike | null | undefined): boolean {
  return isApproved(m) && m!.roles.some((r) => r === "owner" || r === "club_admin" || r === "coach");
}

export function canEditClub(m: MembershipLike | null | undefined): boolean {
  return isAdmin(m);
}

export function canDeleteClub(m: MembershipLike | null | undefined): boolean {
  return isOwner(m);
}

export function canManageSessions(m: MembershipLike | null | undefined): boolean {
  return canManage(m);
}

export function canDeleteSessions(m: MembershipLike | null | undefined): boolean {
  return isAdmin(m);
}

export function canEditEquipment(m: MembershipLike | null | undefined): boolean {
  return canManage(m);
}

export function canDeleteEquipment(m: MembershipLike | null | undefined): boolean {
  return isAdmin(m);
}

export function canManageMembers(m: MembershipLike | null | undefined): boolean {
  return isAdmin(m);
}

export function canEditMemberProfile(
  m: MembershipLike | null | undefined,
  viewerUserId: string | null,
  targetUserId: string,
): boolean {
  if (viewerUserId === targetUserId) return true;
  return canManage(m);
}

export function canViewPrivateMemberData(
  m: MembershipLike | null | undefined,
  viewerUserId: string | null,
  targetUserId: string,
): boolean {
  if (viewerUserId === targetUserId) return true;
  return canManage(m);
}

export function canAccessRoute(
  route: "settings" | "members" | "sessions" | "equipment" | "admin" | "session.new",
  m: MembershipLike | null | undefined,
): boolean {
  if (!isApproved(m)) return false;
  switch (route) {
    case "admin":
      return isAdmin(m);
    case "session.new":
      return canManage(m);
    case "settings":
    case "members":
    case "sessions":
    case "equipment":
      return true;
  }
}
