import { supabase } from "@/integrations/supabase/client";

type OneSignalSdk = {
  Notifications: { requestPermission: () => Promise<boolean> };
  User: { PushSubscription: { id: string | null; optOut: () => Promise<void> } };
};

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: OneSignalSdk) => void | Promise<void>>;
  }
}

function withOneSignal<T>(fn: (OneSignal: OneSignalSdk) => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        resolve(await fn(OneSignal));
      } catch (err) {
        reject(err);
      }
    });
  });
}

// Soft opt-in: only call this from an explicit user tap, never on page load.
export async function enablePushNotifications(memberId: string, clubId: string) {
  return withOneSignal(async (OneSignal) => {
    const granted = await OneSignal.Notifications.requestPermission();
    if (!granted) throw new Error("Push permission was not granted.");
    const playerId = OneSignal.User.PushSubscription.id;
    if (!playerId) throw new Error("OneSignal did not return a subscription id.");
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        { member_id: memberId, club_id: clubId, onesignal_player_id: playerId },
        { onConflict: "member_id,onesignal_player_id" },
      );
    if (error) throw error;
    return playerId;
  });
}

export async function disablePushNotifications(memberId: string) {
  await supabase.from("push_subscriptions").delete().eq("member_id", memberId);
  await withOneSignal(async (OneSignal) => {
    await OneSignal.User.PushSubscription.optOut();
  });
}

export async function sendTestPush(memberId: string) {
  const { data: { session } } = await supabase.auth.getSession();
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
