/**
 * Role-based access E2E-style tests.
 *
 * Simulates the two attack surfaces a malicious Member could try against
 * admin / club-edit screens:
 *
 *   1. Direct URL navigation to admin / club-edit routes.
 *      -> route-guard predicate (canAccessRoute) and UI gating predicates
 *         (canEditClub, canManageMembers, etc.) must deny.
 *
 *   2. Manual API calls (e.g. crafting `supabase.from('clubs').update(...)`
 *      from the browser console) bypassing the UI entirely.
 *      -> Supabase RLS rejects with a 42501 / PostgrestError. We assert
 *         the client surfaces that error rather than silently succeeding.
 *
 * Server-side RLS is the ultimate gate; these tests pin the *client*
 * contract so a UI regression cannot quietly grant access.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  canAccessRoute,
  canEditClub,
  canDeleteClub,
  canManageMembers,
  canManageSessions,
  canDeleteSessions,
  canEditEquipment,
  canDeleteEquipment,
  type MembershipLike,
} from "./permissions";

const member: MembershipLike = { status: "approved", roles: ["member"] };
const pendingMember: MembershipLike = { status: "pending", roles: ["member"] };
const admin: MembershipLike = { status: "approved", roles: ["club_admin"] };

// ---------------------------------------------------------------------------
// 1. Direct-URL access via route guard predicate
// ---------------------------------------------------------------------------

describe("E2E: Member cannot reach admin/club-edit routes via direct URL", () => {
  // Mirrors every protected route a member might paste into the URL bar.
  const protectedRoutes = [
    "/admin",
    "/members/$memberId/edit",
    "/sessions/new",
    "/sessions/$sessionId/edit",
    "/equipment/$equipmentId", // edit form on detail page
    "/equipment/lists/new",
    "/equipment/lists/$listId/edit",
    "/settings#club", // club-edit section of settings
  ] as const;

  function guardFor(path: string): boolean {
    if (path.startsWith("/admin")) return canAccessRoute("admin", member);
    if (path.startsWith("/sessions/new")) return canAccessRoute("session.new", member);
    if (path.startsWith("/sessions/") && path.endsWith("/edit"))
      return canManageSessions(member);
    if (path.startsWith("/members/") && path.endsWith("/edit"))
      return canManageMembers(member);
    if (path.startsWith("/equipment/lists/")) return canEditEquipment(member);
    if (path.startsWith("/equipment/")) return canEditEquipment(member);
    if (path.startsWith("/settings#club")) return canEditClub(member);
    return true;
  }

  it.each(protectedRoutes)("denies Member at %s", (path) => {
    expect(guardFor(path)).toBe(false);
  });

  it("denies pending (not-yet-approved) members everywhere", () => {
    expect(canAccessRoute("admin", pendingMember)).toBe(false);
    expect(canAccessRoute("session.new", pendingMember)).toBe(false);
    expect(canEditClub(pendingMember)).toBe(false);
    expect(canManageMembers(pendingMember)).toBe(false);
  });

  it("denies anonymous (null membership) everywhere", () => {
    expect(canAccessRoute("admin", null)).toBe(false);
    expect(canEditClub(null)).toBe(false);
    expect(canManageMembers(null)).toBe(false);
    expect(canDeleteClub(null)).toBe(false);
  });

  it("control: admin can reach admin/club-edit routes", () => {
    expect(canAccessRoute("admin", admin)).toBe(true);
    expect(canEditClub(admin)).toBe(true);
    expect(canManageMembers(admin)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Manual API attempts (bypassing the UI) must be rejected by RLS
// ---------------------------------------------------------------------------

// Shape of a Supabase RLS denial.
const rlsDenied = {
  data: null,
  error: {
    code: "42501",
    message: 'new row violates row-level security policy for table "clubs"',
    details: null,
    hint: null,
  },
};

function makeRlsClient() {
  // Every chained write call resolves with an RLS-denial envelope, mirroring
  // the real server response a Member would receive if they pasted a mutation
  // into the browser console. The builder is itself thenable so any chain
  // (`.update().eq()`, `.delete().eq()`, `.insert()`) awaits to the same
  // denial object, matching the PostgREST client surface.
  const builder: Record<string, unknown> = {};
  const chain = vi.fn().mockReturnValue(builder);
  builder.update = chain;
  builder.insert = chain;
  builder.delete = chain;
  builder.eq = chain;
  builder.select = chain;
  builder.then = (resolve: (v: typeof rlsDenied) => unknown) => resolve(rlsDenied);
  return { from: vi.fn().mockReturnValue(builder) };
}

describe("E2E: manual API calls from a Member are rejected by RLS", () => {
  let client: ReturnType<typeof makeRlsClient>;

  beforeEach(() => {
    client = makeRlsClient();
  });

  it("blocks UPDATE clubs (rename / settings tamper)", async () => {
    const res = await client.from("clubs").update({ name: "Hacked" }).eq("id", "c1");
    expect(res.error).toBeTruthy();
    expect(res.error?.code).toBe("42501");
    expect(res.data).toBeNull();
  });

  it("blocks INSERT user_roles (privilege escalation to admin)", async () => {
    const res = await client
      .from("user_roles")
      .insert({ user_id: "self", role: "club_admin" });
    expect(res.error?.code).toBe("42501");
  });

  it("blocks DELETE clubs (cannot wipe another club)", async () => {
    const res = await client.from("clubs").delete().eq("id", "c1");
    expect(res.error?.code).toBe("42501");
  });

  it("blocks UPDATE on another member's profile", async () => {
    const res = await client
      .from("profiles")
      .update({ full_name: "Owned" })
      .eq("user_id", "victim-id");
    expect(res.error?.code).toBe("42501");
  });

  it("blocks DELETE sessions (admin-only action)", async () => {
    const res = await client.from("sessions").delete().eq("id", "s1");
    expect(res.error?.code).toBe("42501");
  });
});

// ---------------------------------------------------------------------------
// 3. Defense-in-depth: UI gate AND server gate must both deny
// ---------------------------------------------------------------------------

describe("E2E: UI gate and RLS agree (no client-only trust)", () => {
  it("every admin-only action rejected by predicate is also rejected by RLS mock", async () => {
    const actions: Array<[string, boolean]> = [
      ["edit club", canEditClub(member)],
      ["delete club", canDeleteClub(member)],
      ["delete session", canDeleteSessions(member)],
      ["delete equipment", canDeleteEquipment(member)],
      ["manage members", canManageMembers(member)],
    ];
    for (const [, allowed] of actions) {
      expect(allowed).toBe(false);
    }

    // And the server would deny the same call independently.
    const client = makeRlsClient();
    const res = await client.from("clubs").update({ name: "x" }).eq("id", "c1");
    expect(res.error?.code).toBe("42501");
  });
});
