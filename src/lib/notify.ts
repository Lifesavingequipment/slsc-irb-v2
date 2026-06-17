import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shape inserted into `notifications`. The table columns are:
 * id, club_id, member_id, notification_type, message, related_id, is_read, created_at.
 * `member_id` is members.id (NOT auth.users.id) — resolve via members.auth_user_id = auth.uid().
 */
type NotifyInput = {
  club_id: string;
  notification_type: string;
  message: string;
  related_id?: string | null;
};

const DATE_FMT = "EEE d MMM"; // e.g. "Sat 20 Jun"

const fullName = (m: { first_name: string | null; last_name: string | null }) =>
  [m.first_name ?? "", m.last_name ?? ""].map((s) => s.trim()).filter(Boolean).join(" ") || "A member";

/** Low-level insert: one notification row per member id (deduped, empties skipped). */
export async function notifyMembers(memberIds: string[], input: NotifyInput) {
  const ids = Array.from(new Set(memberIds.filter(Boolean)));
  if (!ids.length) return;
  await supabase.from("notifications").insert(
    ids.map((member_id) => ({
      club_id: input.club_id,
      member_id,
      notification_type: input.notification_type,
      message: input.message,
      related_id: input.related_id ?? null,
    })),
  );
}

/** member_id of the signed-in user for a club (null if not a member). */
export async function currentMemberId(clubId: string): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("members")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("club_id", clubId)
    .maybeSingle();
  return data?.id ?? null;
}

/** Resolve a list of auth user ids to member ids within a club. */
async function membersForUsers(clubId: string, userIds: string[]): Promise<string[]> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (!unique.length) return [];
  const { data } = await supabase
    .from("members")
    .select("id")
    .eq("club_id", clubId)
    .in("auth_user_id", unique);
  return (data ?? []).map((m) => m.id);
}

/** Approved members of a club -> member ids (club_memberships status='approved' joined to members). */
async function approvedMemberIds(clubId: string): Promise<string[]> {
  const { data: mems } = await supabase
    .from("club_memberships")
    .select("user_id")
    .eq("club_id", clubId)
    .eq("status", "approved");
  return membersForUsers(clubId, (mems ?? []).map((m) => m.user_id));
}

/** Club admins/owners -> member ids (club_memberships role joined to members). */
async function clubAdminMemberIds(clubId: string): Promise<string[]> {
  const { data: mems } = await supabase
    .from("club_memberships")
    .select("user_id")
    .eq("club_id", clubId)
    .in("role", ["club_admin", "owner"]);
  return membersForUsers(clubId, (mems ?? []).map((m) => m.user_id));
}

/** Members RSVP'd 'going' to a session -> member ids. */
async function goingMemberIds(sessionId: string, clubId: string): Promise<string[]> {
  const { data: rsvps } = await supabase
    .from("session_rsvps")
    .select("member_id, user_id")
    .eq("session_id", sessionId)
    .eq("status", "going");
  if (!rsvps?.length) return [];

  const ids = new Set<string>();
  const missingUserIds: string[] = [];
  rsvps.forEach((r) => {
    if (r.member_id) ids.add(r.member_id);
    else if (r.user_id) missingUserIds.push(r.user_id);
  });
  (await membersForUsers(clubId, missingUserIds)).forEach((id) => ids.add(id));
  return Array.from(ids);
}

type SessionRef = { id: string; club_id: string; title: string; starts_at: string };
type MemberRef = { id: string; first_name: string | null; last_name: string | null };

/** 1. New session created — notify every approved club member except the creator. */
export async function notifyNewSession(session: SessionRef, creatorMemberId: string | null) {
  const ids = (await approvedMemberIds(session.club_id)).filter((id) => id !== creatorMemberId);
  await notifyMembers(ids, {
    club_id: session.club_id,
    notification_type: "new_session",
    message: `New session: ${session.title} on ${format(new Date(session.starts_at), DATE_FMT)}`,
    related_id: session.id,
  });
}

/** 2. Session updated — notify members RSVP'd 'going' except the updater. */
export async function notifySessionUpdated(session: SessionRef, updaterMemberId: string | null) {
  const ids = (await goingMemberIds(session.id, session.club_id)).filter((id) => id !== updaterMemberId);
  await notifyMembers(ids, {
    club_id: session.club_id,
    notification_type: "session_updated",
    message: `Session updated: ${session.title} on ${format(new Date(session.starts_at), DATE_FMT)}`,
    related_id: session.id,
  });
}

/** 3. Member approved — notify all club admins. */
export async function notifyMemberApproved(clubId: string, member: MemberRef) {
  const ids = await clubAdminMemberIds(clubId);
  const { data: ref } = await supabase
    .from("members")
    .select("auth_user_id")
    .eq("id", member.id)
    .maybeSingle();
  const relatedId = ref?.auth_user_id ?? member.id;
  await notifyMembers(ids, {
    club_id: clubId,
    notification_type: "member_approved",
    message: `${fullName(member)} has joined the club`,
    related_id: relatedId,
  });
}

/** 4. Join request — notify all club admins. */
export async function notifyJoinRequest(clubId: string, member: MemberRef) {
  const ids = await clubAdminMemberIds(clubId);
  const { data: ref } = await supabase
    .from("members")
    .select("auth_user_id")
    .eq("id", member.id)
    .maybeSingle();
  const relatedId = ref?.auth_user_id ?? member.id;
  await notifyMembers(ids, {
    club_id: clubId,
    notification_type: "member_request",
    message: `${fullName(member)} has requested to join the club`,
    related_id: relatedId,
  });
}

/** Notify all approved club members. */
export async function notifyAllClubMembers(input: NotifyInput) {
  await notifyMembers(await approvedMemberIds(input.club_id), input);
}

/** Notify members RSVP'd 'going' to a session. */
export async function notifyGoingMembers(sessionId: string, input: NotifyInput) {
  await notifyMembers(await goingMemberIds(sessionId, input.club_id), input);
}
