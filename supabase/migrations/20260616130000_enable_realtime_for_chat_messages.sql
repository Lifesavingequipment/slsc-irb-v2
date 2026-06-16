-- Enable Supabase realtime for chat tables.
-- The chat subscription (supabase.channel().on('postgres_changes', ...)) was set up
-- correctly in the client, but the tables were not part of the supabase_realtime
-- publication, so Postgres never broadcast inserts/deletes — messages only appeared
-- after a manual refetch. Adding the tables to the publication fixes realtime.
--
-- REPLICA IDENTITY FULL ensures DELETE events carry the full old row (including
-- channel_id) so the channel_id filter on the realtime subscription matches deletes.

alter table public.chat_messages replica identity full;
alter table public.chat_channels replica identity full;
alter table public.chat_members replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_channels'
  ) then
    alter publication supabase_realtime add table public.chat_channels;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_members'
  ) then
    alter publication supabase_realtime add table public.chat_members;
  end if;
end $$;
