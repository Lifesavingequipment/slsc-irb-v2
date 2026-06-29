ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS force_unread boolean NOT NULL DEFAULT false;
