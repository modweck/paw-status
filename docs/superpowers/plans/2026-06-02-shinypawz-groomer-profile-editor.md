# ShinyPawz — Groomer Profile & Availability Editor Implementation Plan

> **For agentic workers:** Implement task-by-task, TDD: write a failing test → run → implement → run → commit. Checkboxes track progress. **npm only.** Run the FULL suite (`npm test`) to verify — single-file `npx vitest run` may apply the classic JSX transform.

**Goal:** A verified-groomer self-service editor for business details, offerings, weekly hours, and time-off, plus the migration that lets a groomer update their own `groomers` row safely.

**Spec:** `docs/superpowers/specs/2026-06-02-shinypawz-groomer-profile-editor-design.md`.

**Data model:** offerings / weekly-hours / time-off tables + RLS already exist (migration `20260529000002`); reads/writes go direct under RLS. Only the `groomers` business row needs a new UPDATE policy (Task 1).

**Build order:** migration → API modules → editors → container + wiring.

> **Note:** the migration cannot be applied to a live DB in this environment; API/UI tests use a mocked Supabase client and don't require it applied. Applying + the SQL-level column-guard check is a manual/CI step.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/<ts>_allow_verified_groomers_update_groomers.sql` (new) | UPDATE policy + column-guard trigger on `groomers`. |
| `apps/web/src/api/groomerProfile.js` (+ test) | Load + update business details. |
| `apps/web/src/api/groomerOfferings.js` (+ test) | Offerings CRUD + validation. |
| `apps/web/src/api/groomerAvailability.js` (+ test) | Weekly-hours + time-off CRUD + overlap validation. |
| `apps/web/src/groomer/BusinessDetailsForm.jsx` (+ test) | Business-details section. |
| `apps/web/src/groomer/OfferingsEditor.jsx` (+ test) | Offerings section. |
| `apps/web/src/groomer/WeeklyHoursEditor.jsx` (+ test) | Weekly-hours section. |
| `apps/web/src/groomer/TimeOffEditor.jsx` (+ test) | Time-off section. |
| `apps/web/src/groomer/GroomerProfileManager.jsx` (+ test) | Container + profile selector + data loading. |
| `apps/web/src/groomer/StaffDashboard.jsx` (+ test) | Mount manager for verified groomers. |

---

## Task 1: Migration — verified groomers can update their `groomers` row

- [ ] **Step 1:** Write `<ts>_allow_verified_groomers_update_groomers.sql`: `grant update on groomers to authenticated`; UPDATE policy gated on a verified membership (mirror the `groomer_offerings` policy); `BEFORE UPDATE` trigger `groomers_restrict_self_update` that — when `auth.role()` is not service role — raises unless only the allowlist (`name, salon, phone, website, timezone, lead_time_hours`) changed.
- [ ] **Step 2:** Self-review the SQL against the offerings policy + `restrict_appointment_request_update_columns` patterns.
- [ ] **Step 3:** Commit (`feat(groomer): allow verified groomers to update their business row (RLS + column guard)`). (Apply/verify against a DB is a manual step.)

## Task 2: groomerProfile API

- [ ] **Step 1:** Failing tests (mock Supabase): `loadGroomerProfile` selects business fields by id; `updateGroomerBusinessDetails` trims/validates and updates only allowlist fields; rejects invalid timezone and negative lead-time.
- [ ] **Step 2:** Run, confirm fail. **Step 3:** Implement. **Step 4:** Run, confirm pass. **Step 5:** Commit.

## Task 3: groomerOfferings API

- [ ] **Step 1:** Failing tests: list by groomer; create/update validate positive `duration_minutes`, `base_price_cents ≥ 0`, non-empty `service`; delete by id. **Steps 2–4:** red→green. **Step 5:** Commit.

## Task 4: groomerAvailability API

- [ ] **Step 1:** Failing tests: weekly hours list/create/update/delete with `day 0–6`, `open < close`, and **overlap rejection** for the same day; time-off create with `start < end`, list, delete. **Steps 2–4:** red→green. **Step 5:** Commit.

## Task 5: BusinessDetailsForm

- [ ] **Step 1:** Failing tests: renders current values; editing + submit calls `updateGroomerBusinessDetails`; shows validation errors. **Steps 2–4.** **Step 5:** build; commit.

## Task 6: OfferingsEditor

- [ ] **Step 1:** Failing tests: lists offerings; add/edit/delete call the API; invalid duration/price blocked with a message. **Steps 2–4.** **Step 5:** build; commit.

## Task 7: WeeklyHoursEditor + TimeOffEditor

- [ ] **Step 1:** Failing tests: weekly hours grid add/edit/delete per day, overlap message; time-off add/delete with start<end. **Steps 2–4.** **Step 5:** build; commit.

## Task 8: GroomerProfileManager + StaffDashboard wiring

- [ ] **Step 1:** Failing tests: manager loads data for the active verified membership, shows a profile selector when >1, renders the four editors; `StaffDashboard` shows the manager for a verified membership and not for a pending-only account.
- [ ] **Step 2:** Run, confirm fail. **Step 3:** Implement container + selector; mount in `GroomerWorkspace`. **Step 4:** Run, confirm pass.
- [ ] **Step 5:** Full suite + build; manual smoke (edit each section, multi-profile switch). **Step 6:** Commit.

---

## Definition of done

- [ ] Verified groomers can edit business details, offerings, weekly hours, and time-off from the dashboard.
- [ ] Migration adds the gated UPDATE policy + column-guard trigger (applied separately).
- [ ] Multi-profile accounts get a working selector; all writes carry the selected `groomerId`.
- [ ] Full Vitest suite green; `npm run build` clean; manual smoke done.
- [ ] All commits pushed to `agent/a7b8c9d0` (not main / live).
