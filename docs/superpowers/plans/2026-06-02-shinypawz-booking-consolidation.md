# ShinyPawz — Booking Consolidation Implementation Plan

> **For agentic workers:** Implement task-by-task. Each task follows TDD: write a failing test → run it to confirm it fails → implement → run to confirm it passes → commit. Steps use checkbox (`- [ ]`) syntax for tracking. **npm only.**

**Goal:** Replace the one-long-page, two-duplicate-form booking experience with a three-step screen flow (search → results → booking), a single adaptive `BookingForm`, an optional exact-time request, and smarter guest prefill.

**Tech stack:** React 18 (JSX), Vitest + Testing Library, Supabase JS, Netlify Functions. No DB migration.

**Spec:** `docs/superpowers/specs/2026-06-02-shinypawz-booking-consolidation-design.md`.

**Constraint:** Add no new architectural patterns. The step machine reuses the existing `history.pushState`/`popstate` routing; exact time reuses the `preferred_windows` JSONB.

**Build order rationale:** Bottom-up so every commit is green. Pure data logic first (Task 1), shared UI pieces next (Task 2), the unified form (Task 3), the visible flow change (Task 4), and destructive cleanup last (Task 5) — only after the replacement is proven.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/src/api/bookingRequests.js` (modify) | Optional `time` (HH:MM) on preferred/backup windows in `buildPreferredWindows` + `normalizePreferredWindow`; export a shared `isValidTime` helper. |
| `apps/web/src/api/bookingRequests.test.js` (modify) | Cover present/absent/malformed `time`. |
| `apps/web/server/guestBooking.js` (modify) | Mirror optional-`time` validation in `cleanPreferredWindow`. |
| `apps/web/server/guestBooking.test.js` (modify) | Server-side `time` validation tests. |
| `apps/web/src/customer/GroomerServiceFields.jsx` (new) | Shared groomer `<select>` + grouped service `<select>` (extracted from both panels). |
| `apps/web/src/customer/GroomerServiceFields.test.jsx` (new) | Component test. |
| `apps/web/src/customer/BookingTimingFieldset.jsx` (new) | Shared first-available + preferred/backup date + time-of-day + optional exact-time inputs. |
| `apps/web/src/customer/BookingTimingFieldset.test.jsx` (new) | Component test. |
| `apps/web/src/customer/guestPrefill.js` (new) | `loadGuestPrefill()` / `saveGuestPrefill()` over `localStorage` key `paw-status:guest-booking-prefill`. |
| `apps/web/src/customer/guestPrefill.test.js` (new) | Round-trip + malformed-JSON tests. |
| `apps/web/src/customer/BookingForm.jsx` (new) | Single adaptive form; guest vs signed-in branch; consumes the shared pieces; guest prefill. |
| `apps/web/src/customer/BookingForm.test.jsx` (new) | Guest + signed-in mode tests (migrated from the two old panels). |
| `apps/web/src/customer/CustomerApp.jsx` (modify) | `step` machine (search/results/booking) + `?step=` history sync + screen rendering. |
| `apps/web/src/customer/CustomerApp.test.jsx` (new or modify) | Step transitions + Back (`popstate`) + deep-link fallbacks. |
| `apps/web/src/customer/CustomerOwnershipPanel.jsx` (modify) | Render `BookingForm` for the booking step; drop the embedded `BookingsListPanel`. |
| `apps/web/src/customer/BookingRequestPanel.jsx` (**remove**) | Replaced by `BookingForm`. |
| `apps/web/src/customer/GuestBookingPanel.jsx` (**remove**) | Replaced by `BookingForm`. |

---

## Task 1: Optional exact time in the booking-request data layer

**Files:** modify `apps/web/src/api/bookingRequests.js`, `apps/web/src/api/bookingRequests.test.js`, `apps/web/server/guestBooking.js`, `apps/web/server/guestBooking.test.js`

- [ ] **Step 1: Write failing tests (client)**
  - `buildPreferredWindows({ preferredDate, preferredTime: '09:30', backupDate, backupTime: '' })` → preferred window has `time: '09:30'`; backup window omits `time`.
  - `normalizePreferredWindow({ type: 'preferred-date', date, timeOfDay: 'morning', time: '09:30' })` → keeps `time: '09:30'`.
  - Absent `time` → window valid, no `time` key.
  - Malformed `time` (`'24:00'`, `'9:5'`, `'09:60'`, `'0930'`) → throws "Choose a valid time."
- [ ] **Step 2: Run tests, confirm they fail**
- [ ] **Step 3: Implement (client)**
  - Add `export function isValidTime(value)` — `/^([01]\d|2[0-3]):[0-5]\d$/`.
  - `buildPreferredWindows` gains `preferredTime = ''` / `backupTime = ''`; include `time` on a window only when truthy.
  - `normalizePreferredWindow`: when `window.time` is present, validate via `isValidTime` (throw "Choose a valid time." otherwise) and include it; when absent, omit (backward-compatible).
- [ ] **Step 4: Run tests, confirm they pass**
- [ ] **Step 5: Server parity**
  - In `server/guestBooking.js` `cleanPreferredWindow`, apply the same optional-`time` check (inline regex or a local `isValidTime`); add server tests for valid + malformed `time`.
  - The netlify wrapper (`apps/web/netlify/functions/guest-booking.js`) needs no change — it delegates to `server/guestBooking.js`.
- [ ] **Step 6: Run full suite + build; commit** (`feat(booking): optional exact-time request on preferred windows`)

---

## Task 2: Extract shared form pieces

**Files:** new `GroomerServiceFields.jsx` (+ test), `BookingTimingFieldset.jsx` (+ test)

- [ ] **Step 1: Write failing tests**
  - `GroomerServiceFields`: renders a groomer option per groomer; renders grouped service options; fires `onGroomerChange` / `onServiceChange`.
  - `BookingTimingFieldset`: first-available checkbox toggles `onFirstAvailableChange`; preferred/backup date + time-of-day + optional exact-time inputs fire their change handlers; exact-time input is labeled optional/"a request".
- [ ] **Step 2: Run, confirm they fail**
- [ ] **Step 3: Implement**
  - Move `serviceOptionsForGroomer` / `chooseServiceForGroomer` into a shared module (e.g. `src/customer/groomerServices.js`) or co-locate in `GroomerServiceFields`; both old panels duplicate them today.
  - `BookingTimingFieldset` owns the `<fieldset>`/`<legend>` markup currently copy-pasted in both panels, plus the new exact-time inputs.
  - Pure presentational components — value + onChange props, no data fetching.
- [ ] **Step 4: Run, confirm they pass**
- [ ] **Step 5: Build; commit** (`refactor(booking): extract shared GroomerServiceFields + BookingTimingFieldset`)

---

## Task 3: Unified `BookingForm` + guest prefill

**Files:** new `guestPrefill.js` (+ test), `BookingForm.jsx` (+ test)

- [ ] **Step 1: Write failing tests — `guestPrefill`**
  - `saveGuestPrefill(obj)` then `loadGuestPrefill()` round-trips the stored fields.
  - `loadGuestPrefill()` returns `null`/`{}` (defined default) on missing or malformed JSON (no throw).
- [ ] **Step 2: Implement `guestPrefill.js`** — read/write `localStorage` key `paw-status:guest-booking-prefill`; guard for absent `window`/`localStorage`; try/catch JSON parse.
- [ ] **Step 3: Write failing tests — `BookingForm`** (migrate the meaningful assertions from `BookingRequestPanel`/`GuestBookingPanel` tests)
  - **Signed-in mode** (`useAuth` → user; `customer` + `dogs` props): renders dog `<select>`, no contact fields; submitting calls `createBookingRequest` with the chosen dog/groomer/service + windows incl. exact time.
  - **Guest mode** (no user): renders contact + dog fields; on mount, fields hydrate from `loadGuestPrefill`; submitting calls `createGuestBookingRequest`; on success, persists via `saveGuestPrefill` and stores the claim token.
- [ ] **Step 4: Run, confirm they fail**
- [ ] **Step 5: Implement `BookingForm.jsx`**
  - One component; derive `isSignedIn` from `useAuth()`.
  - Compose `GroomerServiceFields` + `BookingTimingFieldset`.
  - Signed-in branch ports `BookingRequestPanel` behavior (dog dropdown, preference-driven prefill, `buildCustomerNotes`); guest branch ports `GuestBookingPanel` behavior + `guestPrefill` hydrate/save and the "save info / magic link" nudge.
  - Wire `preferredTime`/`backupTime` through `buildPreferredWindows`.
- [ ] **Step 6: Run, confirm they pass; build**
- [ ] **Step 7: Commit** (`feat(booking): unified adaptive BookingForm with guest prefill`)
  - NOTE: old panels are still present and referenced here; do not delete yet (Task 5).

---

## Task 4: Step machine + screens in `CustomerApp`

**Files:** modify `CustomerApp.jsx`; add/modify `CustomerApp.test.jsx`; modify `CustomerOwnershipPanel.jsx` to render `BookingForm`

- [ ] **Step 1: Write failing tests**
  - Initial render shows the **search** screen.
  - Submitting a search (mock `fetchNearbyGroomers`) advances to **results** and pushes `?step=results`.
  - Picking a groomer advances to **booking** (`?step=booking`) and renders `BookingForm`.
  - `popstate` back from booking → results → search.
  - Fresh load at `?step=booking` with no selected groomer falls back to **search**.
- [ ] **Step 2: Run, confirm they fail**
- [ ] **Step 3: Implement**
  - Add `step` state derived from `?step=` on mount (default `search`), with the prerequisite fallbacks.
  - `goToStep(next)` sets state + `history.pushState(..., \`/?step=${next}\`)`; a `popstate` handler restores `step` from the param.
  - Render one screen at a time: search form / results list (+ `PopularNearYou`, "edit search") / booking (`CustomerOwnershipPanel` or guest `BookingForm`).
  - `startBookingForGroomer` sets `selectedGroomer` and `goToStep('booking')` (replaces today's scroll-to-anchor).
  - Update `CustomerOwnershipPanel` to render `BookingForm` (signed-in) for the booking step; keep its profile-creation gating.
- [ ] **Step 4: Run, confirm they pass; build**
- [ ] **Step 5: Manual smoke** — `npm run dev`, walk search → results → booking, Back button, guest + signed-in. (UI change: verify in browser, not just tests.)
- [ ] **Step 6: Commit** (`feat(booking): three-step search/results/booking screen flow`)

---

## Task 5: Cleanup — remove old panels, relocate the bookings list

**Files:** remove `BookingRequestPanel.jsx`, `GuestBookingPanel.jsx` (+ their tests); modify `CustomerOwnershipPanel.jsx` + the `/bookings` rendering

- [ ] **Step 1: Move `BookingsListPanel`** to render only on the `/bookings` screen (the `bookings` section), not beside the booking form. Confirm the booking confirmation links to `/bookings`.
- [ ] **Step 2: Delete** `BookingRequestPanel.jsx`, `GuestBookingPanel.jsx`, and their test files. Grep for any lingering imports and remove them.
- [ ] **Step 3: Run full suite + build** — confirm nothing imports the deleted files and all tests pass.
- [ ] **Step 4: Manual smoke** — bookings list appears under `/bookings`; booking screen no longer shows it.
- [ ] **Step 5: Commit** (`refactor(booking): remove duplicate panels; bookings list lives on /bookings`)

---

## Definition of done

- [ ] Search → results → booking is a real three-step flow with working Back button and `?step=` URLs.
- [ ] A single `BookingForm` serves guest + signed-in; the two old panels are gone.
- [ ] Optional exact time persists in `preferred_windows`, validated client- and server-side; old rows still valid.
- [ ] Returning guests see their details prefilled.
- [ ] "Your bookings" appears only on `/bookings`.
- [ ] Full Vitest suite green; `npm run build` clean; manual smoke of both auth states done.
- [ ] All commits pushed to `agent/a7b8c9d0` (no push to main / live site).
