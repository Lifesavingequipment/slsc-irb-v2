# IRB Racing improvements

Large scope. I'll tackle it in ordered phases so we can ship and verify each one before the next. Reply with what to start (or "all") and I'll begin.

## Phase A — Sessions UX
1. **Filters + Calendar view** on `/sessions`: tabs for Upcoming / This week / Next week / Calendar. Calendar = month grid with dots per session; tap a day → list of that day's sessions; tap a session → detail page. Mobile-first.
2. **Repeating sessions**: in `/sessions/new`, when "Repeats" is on, show Start date, End date, frequency (daily/weekly/custom days), and a live count: *"This will create N sessions."* Each generated session copies title, times, location, RSVP deadline rule, capacity, carpool-enabled flag + template, and survey questions.
3. **Carpool visibility**: hide the Carpool tab entirely from member view when `sessions.carpool_enabled` is false (admin/coach still see it so they can enable).
4. **No blank screens** after save — add error toasts + guards.

## Phase B — Survey
5. **Enable survey on create**: `/sessions/new` gets a Survey toggle + inline editor (reuses `SurveyEditor`) and "Apply template". Questions are inserted in the same flow as the session.
6. **Submitted state**: after submit, `SurveyRunner` shows a "✓ Submitted" panel with last-submitted timestamp + an **Edit Survey** button that re-opens the form pre-filled. Saving upserts responses (replace by `(question_id, user_id)`).

## Phase C — Carpool overhaul
7. **Unknown driver**: `driver_user_id` becomes nullable; UI shows "To be confirmed". Admin/coach can later nominate a driver from session attendees (RSVP = going). Passenger capacity rules unchanged; trigger updated to skip the driver check when null.
8. **Trailers**: add `trailer_count` on session, `trailer_number` (int, nullable, unique-per-session) on carpools. Editor lets admin/coach set how many trailers and assign one per vehicle with a dropdown (No trailer / Trailer 1…N). Unique constraint enforced.
9. **Pickup mode**: new column `carpools.pickup_mode` = `fixed` | `adjustable`. Admin/coach define pickup options (location + time). Members requesting a ride pick from those options when fixed; can suggest custom when adjustable. Coach approves/edits suggested requests.

## Phase D — Settings & Templates
10. **Profile collapsed** on `/settings` by default (Accordion, all sections collapsed; user expands what they need).
11. **Templates page**: add "New" button on every tab (Carpool, Survey, Training plan, Drills) with a creation dialog per tab. Consistent header layout.

## Phase E — Member Dashboard
12. "Next 7 days" section with 3 cards: **Surveys to complete**, **RSVPs to complete**, **Upcoming training** — each with count + shortcut button. Counts recompute on focus and after RSVP/survey mutations.

## Phase F — Debug pass
- Reproduce save flow; confirm no blank screens.
- Verify recurring session insert is transactional (rollback if any row fails).
- Verify member visibility flags (`carpool_enabled`, `survey_enabled`).
- Verify RLS still blocks members from editing settings.
- Mobile pass at 360×667 on each new screen.

## Technical notes
- **Migrations**: `sessions` (`trailer_count`, `repeats_*` cleanup), `carpools` (`driver_user_id` nullable, `trailer_number`, `pickup_mode`), new `carpool_pickup_options` table, RLS + GRANTs, trigger updates for driver-null and trailer-uniqueness.
- **Frontend**: new `SessionsCalendar.tsx`; extend `CarpoolEditor` (trailers, pickup mode, unknown driver); extend `SurveyRunner` (submitted/edit state); extend `_app.sessions.new.tsx` (inline survey + recurrence preview); rewrite `/sessions` index with tabs.
- **Reuse**: existing `SurveyEditor`, `coach_can` for permission gating, `useRefetchOnFocus` for dashboard.
- **Out of scope for this pass**: training-plan drag reorder, plan markdown formatting — can follow after.

Reply with the phase(s) to start with, or "all" and I'll go top-to-bottom.
