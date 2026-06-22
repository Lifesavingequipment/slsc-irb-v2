# ⚠️ ALL WORK MUST BE COMMITTED AND PUSHED DIRECTLY TO `MASTER`. NEVER CREATE OR PUSH TO A FEATURE BRANCH. ⚠️

# Claude Code Rules

## Git Workflow
- **Always commit directly to `master`**
- **Never create feature branches**
- If a branch is created, immediately merge it to `master` and push before finishing
- Never ask for permission to push to `master` — it is always approved

## Deployment
- Vercel auto-deploys from `master` — this is expected and desired
- Every commit to `master` is intentional

---

# SLSC IRB v2 — Project Context

## Apps
- **IRB v2 (main):** https://slsc-irb-v2.vercel.app
- **Membership:** https://slsc-membership.vercel.app

## Supabase
- **Project:** wrhjentdpnszfugfgrjb

## Design System
- **Primary:** #FF6600 (orange), **Sidebar:** #1e293b
- **Font:** Inter, **Cards:** rounded-xl, **Buttons:** rounded-md
- **Components:** shadcn/ui, **Icons:** lucide-react 0.575.0
- **Logo:** public/irb-logo.png (Orange Prop)

## Clubs
- **Kurrawa Surf Life Saving Club** — Club ID: 00cfbea7-83b4-4355-8dd1-709e1bd9ef59
- **Sunset Beach** — Club ID: f1233bc3-47d1-435d-84a4-5a99fefef236

## Database Notes
- `user_roles` is a VIEW over base table `club_roles`
- `club_roles` UNIQUE constraint: (user_id, club_id) — one role per user per club
- Valid roles: `club_admin`, `coach`, `assistant_coach`, `member`
- `locations` columns: id, club_id, name, address, is_default, created_by, created_at
- `session_weather_cache`: session_id, lat, lng, weather, waves, tides, weather_updated_at, tides_updated_at
- `message_reactions`: id, message_id, member_id, emoji, created_at
- `message_reads`: id, message_id, member_id, read_at
- `chat_messages` extra columns: deleted_at, reply_to_id, attachment_url, attachment_name, attachment_type, attachment_size
- Location stored as "Name — Address" string; UI shows split(" — ")[0]
- Notifications `related_id` must be auth_user_id (not members.id)

## External APIs
- **Weather/surf:** Open-Meteo (free, no key)
- **Tide data:** WorldTides API key: `66bb47cc-e0d5-4fd7-8ac4-ed1ab4601b00`
- **Address autocomplete:** OpenStreetMap Nominatim (AU + NZ)

## Edge Functions
- `fetch-session-weather` — fetches/caches weather+tides per session
- `daily-tide-refresh` — GitHub Actions at 1am AEST, pre-fetches today's session tides
