import { supabase } from "@/integrations/supabase/client";

// Public VAPID key — safe to commit (not a secret).
const VAPID_PUBLIC_KEY =
  "BCPIBQAWzNo4m1XXLfrnhtb02TNIXk_F6q-oCMEUMjJnp5jirbO__ILS6FZPFoinORn2VRjXzskK2VrhJvwx9eQ";

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

async function getSwRegistration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

// Returns true if this browser has an active push subscription whose endpoint
// is stored in the DB for this member.
export async function checkPushEnabled(memberId: string): Promise<boolean> {
  if (!("PushManager" in window)) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return false;
    const { count } = await supabase
      .from("push_subscriptions")
      .select("id", { head: true, count: "exact" })
      .eq("member_id", memberId)
      .eq("endpoint", sub.endpoint)
      .then(({ count }) => ({ count }));
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function enablePushNotifications(memberId: string, clubId: string): Promise<void> {
  if (!("PushManager" in window)) {
    throw new Error("Push notifications are not supported on this browser.");
  }
  const reg = await getSwRegistration();
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Push notification permission was not granted.");

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  const json = subscription.toJSON() as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      member_id: memberId,
      club_id: clubId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    { onConflict: "endpoint" },
  );
  if (error) throw error;
}

export async function disablePushNotifications(memberId: string): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    if (reg) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
        return;
      }
    }
  } catch {
    // fall through
  }
  // Fallback: clear all DB rows for this member
  await supabase.from("push_subscriptions").delete().eq("member_id", memberId);
}

export async function sendTestPush(
  memberId: string,
): Promise<{ sent: boolean; recipients?: number; reason?: string }> {
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
