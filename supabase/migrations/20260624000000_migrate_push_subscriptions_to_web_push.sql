-- Migrate push_subscriptions from OneSignal to native Web Push (VAPID).
-- Drops OneSignal columns, adds endpoint/p256dh/auth for Web Push subscriptions.
-- Existing rows are cleared since they hold OneSignal data, not browser endpoints.

alter table public.push_subscriptions
  drop column if exists onesignal_player_id,
  drop column if exists onesignal_user_id;

-- Remove the old unique constraint (was on member_id + onesignal_player_id)
alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_member_id_onesignal_player_id_key;

-- Clear stale OneSignal rows before adding NOT NULL constraints
delete from public.push_subscriptions;

alter table public.push_subscriptions
  add column if not exists endpoint text,
  add column if not exists p256dh  text,
  add column if not exists auth    text;

alter table public.push_subscriptions
  alter column endpoint set not null,
  alter column p256dh  set not null,
  alter column auth    set not null;

-- Each browser endpoint is globally unique (one row per device)
alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_unique unique (endpoint);
