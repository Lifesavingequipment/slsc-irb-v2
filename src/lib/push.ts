import { supabase } from "@/integrations/supabase/client";

// VAPID public key (URL-safe base64, 65-byte uncompressed P-256 point).
// The matching private key must be set as VAPID_PRIVATE_KEY in Supabase edge function secrets.
export const VAPID_PUBLIC_KEY =
  "BGlEY4Kti932EYcfbwfAMGKDK6kBcnSUikAYXJT4e2VC30_7s3zUL2ZodS-2NOEBWRn3-9YARtULk5SGL5G3XIg";

// Convert URL-safe base64 → Uint8Array (required by pushManager.subscribe applicationServerKey).
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function enablePushNotifications(memberId: string, clubId: string) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push notifications are not supported in this browser.");
  }

  // Wait for the active, fully-activated service worker registration.
  const registration = await navigator.serviceWorker.ready;

  let subscription: PushSubscription;
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  } catch (err) {
    const e = err as DOMException | Error;
    console.error("[push] pushManager.subscribe() failed:", e.name, e.message, e);
    throw new Error(`Could not enable: ${e.name} – ${e.message}`);
  }

  const keyBuf = subscription.getKey("p256dh");
  const authBuf = subscription.getKey("auth");
  if (!keyBuf || !authBuf) {
    throw new Error("Push subscription is missing encryption keys (p256dh/auth).");
  }

  // btoa produces standard base64; the edge function decodes it the same way.
  const p256dh = btoa(String.fromCharCode(...new Uint8Array(keyBuf)));
  const auth = btoa(String.fromCharCode(...new Uint8Array(authBuf)));

  // Replace any existing subscription for this member (one active device at a time).
  await supabase.from("push_subscriptions").delete().eq("member_id", memberId);

  const { error } = await supabase.from("push_subscriptions").insert({
    member_id: memberId,
    club_id: clubId,
    endpoint: subscription.endpoint,
    p256dh,
    auth,
  });
  if (error) throw error;

  // Register the same subscription for any other clubs this user belongs to.
  // Errors here are non-fatal — the primary subscription already succeeded.
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: otherMemberships } = await supabase
        .from("club_memberships")
        .select("club_id")
        .eq("user_id", user.id)
        .eq("status", "approved")
        .neq("club_id", clubId);

      if (otherMemberships?.length) {
        const { data: otherMembers } = await supabase
          .from("members")
          .select("id, club_id")
          .eq("auth_user_id", user.id)
          .in(
            "club_id",
            otherMemberships.map((m) => m.club_id),
          );

        if (otherMembers?.length) {
          const { error: upsertError } = await supabase.from("push_subscriptions").upsert(
            otherMembers.map((m) => ({
              member_id: m.id,
              club_id: m.club_id,
              endpoint: subscription.endpoint,
              p256dh,
              auth,
            })),
            { onConflict: "member_id" },
          );
          if (upsertError) console.warn("[push] secondary club upsert failed:", upsertError);
        }
      }
    }
  } catch (err) {
    console.warn("[push] secondary club registration failed:", err);
  }

  return subscription.endpoint;
}

export async function disablePushNotifications(memberId: string) {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) await subscription.unsubscribe();
  await supabase.from("push_subscriptions").delete().eq("member_id", memberId);
}

export async function sendTestPush(memberId: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({
      member_ids: [memberId],
      title: "Test push 🎉",
      body: "If you can see this, push notifications are working.",
    }),
  });
  if (!res.ok) throw new Error((await res.text()) || "Failed to send test push");
  return res.json();
}
