import { describe, it, expect } from "vitest";
import {
  isOwner, isAdmin, isCoach, canManage,
  canEditClub, canDeleteClub,
  canManageSessions, canDeleteSessions,
  canEditEquipment, canDeleteEquipment,
  canManageMembers, canEditMemberProfile, canViewPrivateMemberData,
  canAccessRoute,
  type MembershipLike,
} from "./permissions";

const owner: MembershipLike = { status: "approved", roles: ["owner", "club_admin"] };
const admin: MembershipLike = { status: "approved", roles: ["club_admin"] };
const coach: MembershipLike = { status: "approved", roles: ["coach", "member"] };
const member: MembershipLike = { status: "approved", roles: ["member"] };
const pending: MembershipLike = { status: "pending", roles: ["member"] };
const rejected: MembershipLike = { status: "rejected", roles: ["club_admin"] };

describe("role predicates", () => {
  it("identifies owner only for approved owner", () => {
    expect(isOwner(owner)).toBe(true);
    expect(isOwner(admin)).toBe(false);
    expect(isOwner(coach)).toBe(false);
    expect(isOwner(member)).toBe(false);
    expect(isOwner(pending)).toBe(false);
    expect(isOwner(null)).toBe(false);
  });

  it("identifies admin for owner and club_admin only", () => {
    expect(isAdmin(owner)).toBe(true);
    expect(isAdmin(admin)).toBe(true);
    expect(isAdmin(coach)).toBe(false);
    expect(isAdmin(member)).toBe(false);
  });

  it("identifies coach only for explicit coach role", () => {
    expect(isCoach(coach)).toBe(true);
    expect(isCoach(admin)).toBe(false);
    expect(isCoach(member)).toBe(false);
  });

  it("canManage is true for owner/admin/coach, false for members", () => {
    expect(canManage(owner)).toBe(true);
    expect(canManage(admin)).toBe(true);
    expect(canManage(coach)).toBe(true);
    expect(canManage(member)).toBe(false);
  });

  it("ignores roles when not approved", () => {
    expect(canManage(pending)).toBe(false);
    expect(isAdmin(rejected)).toBe(false);
  });
});

describe("club permissions", () => {
  it("only admins can edit the club", () => {
    expect(canEditClub(owner)).toBe(true);
    expect(canEditClub(admin)).toBe(true);
    expect(canEditClub(coach)).toBe(false);
    expect(canEditClub(member)).toBe(false);
  });

  it("only owner can delete the club", () => {
    expect(canDeleteClub(owner)).toBe(true);
    expect(canDeleteClub(admin)).toBe(false);
    expect(canDeleteClub(coach)).toBe(false);
  });
});

describe("sessions & equipment", () => {
  it("coaches can manage sessions; members cannot", () => {
    expect(canManageSessions(coach)).toBe(true);
    expect(canManageSessions(member)).toBe(false);
  });
  it("only admins can delete sessions", () => {
    expect(canDeleteSessions(coach)).toBe(false);
    expect(canDeleteSessions(admin)).toBe(true);
  });
  it("coaches can edit equipment; only admins can delete it", () => {
    expect(canEditEquipment(coach)).toBe(true);
    expect(canEditEquipment(member)).toBe(false);
    expect(canDeleteEquipment(coach)).toBe(false);
    expect(canDeleteEquipment(admin)).toBe(true);
  });
});

describe("member profile access", () => {
  it("self can always edit and view own private data", () => {
    expect(canEditMemberProfile(member, "u1", "u1")).toBe(true);
    expect(canViewPrivateMemberData(member, "u1", "u1")).toBe(true);
  });
  it("members cannot edit or view other members' private data", () => {
    expect(canEditMemberProfile(member, "u1", "u2")).toBe(false);
    expect(canViewPrivateMemberData(member, "u1", "u2")).toBe(false);
  });
  it("coaches can edit and view other members' data", () => {
    expect(canEditMemberProfile(coach, "u1", "u2")).toBe(true);
    expect(canViewPrivateMemberData(coach, "u1", "u2")).toBe(true);
  });
  it("only admins can remove members", () => {
    expect(canManageMembers(admin)).toBe(true);
    expect(canManageMembers(coach)).toBe(false);
  });
});

describe("route access", () => {
  it("members cannot access admin or session.new", () => {
    expect(canAccessRoute("admin", member)).toBe(false);
    expect(canAccessRoute("session.new", member)).toBe(false);
  });
  it("coaches can create sessions but not access admin", () => {
    expect(canAccessRoute("session.new", coach)).toBe(true);
    expect(canAccessRoute("admin", coach)).toBe(false);
  });
  it("admins can access admin", () => {
    expect(canAccessRoute("admin", admin)).toBe(true);
  });
  it("unauthenticated/pending users cannot access any route", () => {
    expect(canAccessRoute("sessions", null)).toBe(false);
    expect(canAccessRoute("members", pending)).toBe(false);
  });
});
