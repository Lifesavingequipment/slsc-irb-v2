
ALTER TABLE public.session_teams ALTER COLUMN wave DROP NOT NULL;
ALTER TABLE public.session_teams ALTER COLUMN wave DROP DEFAULT;
ALTER TABLE public.session_teams ALTER COLUMN lane DROP NOT NULL;
ALTER TABLE public.session_teams ALTER COLUMN lane DROP DEFAULT;
