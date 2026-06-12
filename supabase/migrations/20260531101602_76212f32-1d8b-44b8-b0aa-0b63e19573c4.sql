ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS passport_number text,
  ADD COLUMN IF NOT EXISTS passport_expiry date,
  ADD COLUMN IF NOT EXISTS nationality text;