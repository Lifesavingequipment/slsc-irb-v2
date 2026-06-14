import { supabase } from "@/integrations/supabase/client";

type NotificationBase = {
  club_id: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
};

export async function notifyMembers(memberIds: string[], base: NotificationBase) {
  if (!memberIds.length) return;
  await supabase.from("notifications").insert(
    memberIds.map((id) => ({ ...base, member_id: id })),
  );
}

export async function notifyAllClubMembers(base: NotificationBase) {
  const { data: ms } = await supabase
    .from("members")
    .select("id")
    .eq("club_id", base.club_id)
    .eq("status", "approved");
  if (!ms?.length) return;
  await supabase.from("notifications").insert(ms.map((m) => ({ ...base, member_id: m.id })));
}

export async function notifyGoingMembers(sessionId: string, base: NotificationBase) {
  const { data: rsvps } = await supabase
    .from("session_rsvps")
    .select("member_id, user_id")
    .eq("session_id", sessionId)
    .eq("status", "going");
  if (!rsvps?.length) return;

  const memberIds = new Set<string>();
  const missingUserIds: string[] = [];
  rsvps.forEach((r) => {
    if (r.member_id) memberIds.add(r.member_id);
    else if (r.user_id) missingUserIds.push(r.user_id);
  });

  if (missingUserIds.length) {
    const { data: ms } = await supabase
      .from("members")
      .select("id")
      .eq("club_id", base.club_id)
      .in("auth_user_id", missingUserIds);
    ms?.forEach((m) => memberIds.add(m.id));
  }

  if (!memberIds.size) return;
  await supabase.from("notifications").insert(
    Array.from(memberIds).map((id) => ({ ...base, member_id: id })),
  );
}
