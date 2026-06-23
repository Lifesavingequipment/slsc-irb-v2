-- The new OneSignal API (api.onesignal.com) targets recipients by OneSignal
-- user ID via include_aliases, not by subscription ID — store both.
alter table public.push_subscriptions add column if not exists onesignal_user_id text;
