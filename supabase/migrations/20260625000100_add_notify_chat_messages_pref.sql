ALTER TABLE public.member_preferences
  ADD COLUMN IF NOT EXISTS notify_chat_messages boolean NOT NULL DEFAULT true;
