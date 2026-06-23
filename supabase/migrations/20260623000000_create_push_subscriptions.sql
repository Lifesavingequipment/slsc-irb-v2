-- OneSignal push notification subscriptions (Phase 1 foundation — no triggers wired yet).

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  onesignal_player_id text not null,
  created_at timestamptz not null default now(),
  unique (member_id, onesignal_player_id)
);

alter table public.push_subscriptions enable row level security;

create policy "members can view own push subscriptions" on public.push_subscriptions
  for select using (
    member_id in (select id from public.members where auth_user_id = auth.uid())
  );

create policy "members can insert own push subscriptions" on public.push_subscriptions
  for insert with check (
    member_id in (select id from public.members where auth_user_id = auth.uid())
  );

create policy "members can delete own push subscriptions" on public.push_subscriptions
  for delete using (
    member_id in (select id from public.members where auth_user_id = auth.uid())
  );
