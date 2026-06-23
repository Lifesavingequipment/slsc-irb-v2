import { supabase } from "@/integrations/supabase/client";

type PushSubscriptionChangeEvent = { current: { id: string | null } };

type OneSignalSdk = {
  Notifications: { requestPermission: () => Promise<boolean> };
  User: {
    PushSubscription: {
      id: string | null;
      optOut: () => Promise<void>;
      addEventListener: (
        event: "change",
        listener: (event: PushSubscriptionChangeEvent) => void,
      ) => void;
      removeEventListener: (
        event: "change",
        listener: (event: PushSubscriptionChangeEvent) => void,
      ) => void;
    };
  };
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

// The push subscription id is null until OneSignal finishes registering the
// subscription with its backend — that can happen just after permission is
// granted, so wait for the "change" event rather than reading .id immediately.
function waitForPushSubscriptionId(OneSignal: OneSignalSdk, timeoutMs = 15000): Promise<string> {
  const existing = OneSignal.User.PushSubscription.id;
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const onChange = (event: PushSubscriptionChangeEvent) => {
      if (event.current.id) {
        cleanup();
        resolve(event.current.id);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for OneSignal to register the push subscription."));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      OneSignal.User.PushSubscription.removeEventListener("change", onChange);
    };
    OneSignal.User.PushSubscription.addEventListener("change", onChange);
  });
}

// Soft opt-in: only call this from an explicit user tap, never on page load.
export async function enablePushNotifications(memberId: string, clubId: string) {
  return withOneSignal(async (OneSignal) => {
    const granted = await OneSignal.Notifications.requestPermission();
    if (!granted) throw new Error("Push permission was not granted.");
    const playerId = await waitForPushSubscriptionId(OneSignal);
    // Re-enabling can follow a stale/incorrect saved id (e.g. from before this
    // fix) — drop any existing rows for this member so the correct id replaces it.
    await supabase.from("push_subscriptions").delete().eq("member_id", memberId);
    const { error } = await supabase
      .from("push_subscriptions")
      .insert({ member_id: memberId, club_id: clubId, onesignal_player_id: playerId });
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
