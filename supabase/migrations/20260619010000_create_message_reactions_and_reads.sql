-- Reactions and read receipts for chat messages.

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, member_id, emoji)
);

create table if not exists public.message_reads (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  read_at timestamptz not null default now(),
  unique (message_id, member_id)
);

alter table public.message_reactions enable row level security;
alter table public.message_reads enable row level security;

create policy "authenticated can manage message_reactions" on public.message_reactions
  for all using (auth.role() = 'authenticated');

create policy "authenticated can manage message_reads" on public.message_reads
  for all using (auth.role() = 'authenticated');

alter table public.message_reactions replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end $$;
