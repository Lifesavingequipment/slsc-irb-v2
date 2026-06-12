ALTER TYPE public.attendance_status ADD VALUE IF NOT EXISTS 'injured';
ALTER TABLE public.session_teams ADD COLUMN IF NOT EXISTS wave_name text;