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
- `members` — member profiles (per club; links via auth_user_id)
- `clubs` — club records (use club_name not name)
- `club_memberships` — user ↔ club membership with status/role
- `sessions` — training sessions
- `session_teams` — wave draw
- `session_rsvps` — member RSVPs
- `equipment` — gear inventory
- `profiles` — legacy user profiles (kept for rollback; not queried by app)

## Deploy
Push to `master` branch triggers auto-deploy on Vercel via GitHub connection.

<!-- Last updated: 2026-06-12 -->
