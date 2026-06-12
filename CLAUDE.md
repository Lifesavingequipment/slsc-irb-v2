# slsc-irb-v2

IRB Training management app for Surf Life Saving clubs in Australia and New Zealand.

## Stack
- TanStack Start (React, SSR)
- Supabase (central database)
- Tailwind CSS + shadcn/ui
- Deployed on Vercel

## Supabase
- Project: slsc-central-platform
- URL: https://wrhjentdpnszfugfgrjb.supabase.co
- Env vars: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`

## Key tables
- `profiles` — user profiles
- `clubs` — club records
- `sessions` — training sessions
- `session_teams` — wave draw
- `session_rsvps` — member RSVPs
- `equipment` — gear inventory

## Deploy
Push to `master` branch triggers auto-deploy on Vercel via GitHub connection.
