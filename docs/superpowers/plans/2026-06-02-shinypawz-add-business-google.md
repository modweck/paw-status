# ShinyPawz — Find & Add Your Business via Google Implementation Plan

> **For agentic workers:** TDD task-by-task: failing test → run → implement → run → commit. **npm only.** Verify with the FULL suite (`npm test`); single-file `.jsx` runs may use the classic JSX transform.

**Goal:** A groomer searches Google for their business, picks it, and the server creates/claims the `groomers` row; the client files a pending membership for admin verification.

**Spec:** `docs/superpowers/specs/2026-06-02-shinypawz-add-business-google-design.md`.

**Build order:** server search → server create/link → endpoints → client API → UI + wiring.

> **Notes:** No migration (server uses the service-role key to insert; membership reuses `requestGroomerMembership`). Server tests inject `fetchImpl` and a fake service-role client; nothing calls Google or Supabase for real.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/server/googlePlaces.js` (+ test) | Add `searchBusinesses` (Places Text Search). |
| `apps/web/server/groomerBusiness.js` (+ test) | Session verify + search wrapper + `linkGroomerBusinessFromPlace` (upsert). |
| `apps/web/netlify/functions/groomer-business-search.js` | POST `/api/groomer-business-search`. |
| `apps/web/netlify/functions/groomer-business-link.js` | POST `/api/groomer-business-link`. |
| `apps/web/vite.config.js` | Dev plugins for both endpoints (mirror `guestBookingDevPlugin`). |
| `apps/web/src/api/groomerBusiness.js` (+ test) | Client `searchGroomerBusinesses` / `linkGroomerBusiness`. |
| `apps/web/src/groomer/AddYourBusiness.jsx` (+ test) | Search → pick → link → request membership. |
| `apps/web/src/groomer/StaffDashboard.jsx` (+ test) | Entry to the Add-business screen. |

---

## Task 1: googlePlaces.searchBusinesses

- [ ] **Step 1:** Failing test (inject `fetchImpl`): a `places:searchText` response → mapped `[{ placeId, name, address, rating, reviewCount }]`; an error response maps via the existing public-error helper.
- [ ] **Step 2:** Run, confirm fail. **Step 3:** Implement using the same endpoint/field-mask shape as `scripts/seed-groomers.js`. **Step 4:** Run, confirm pass. **Step 5:** Commit.

## Task 2: server groomerBusiness.js

- [ ] **Step 1:** Failing tests (fake `fetchImpl`, fake service-role client, fake auth):
  - `searchGroomerBusinesses` rejects without a valid session; returns candidates with one.
  - `linkGroomerBusinessFromPlace` rejects without a session; with one, fetches details and **upserts** the `groomers` row (assert the row incl. `location` `SRID=4326;POINT(lng lat)`, google_place_id, name, address, lat, lng, phone, website, rating, review_count) and returns the mapped groomer; dedupe path returns the existing row.
- [ ] **Step 2–4:** red→green. **Step 5:** Commit.

## Task 3: endpoints + dev plugins

- [ ] **Step 1:** Add the two Netlify functions (parse body, read bearer token, call the server logic, return JSON / mapped errors), mirroring `netlify/functions/guest-booking.js`.
- [ ] **Step 2:** Add Vite dev plugins for `/api/groomer-business-search` and `/api/groomer-business-link` forwarding `Authorization` (mirror `guestBookingDevPlugin`).
- [ ] **Step 3:** Build; commit. (Endpoints are thin wrappers; covered via the server-logic tests + manual smoke.)

## Task 4: client API

- [ ] **Step 1:** Failing tests (mock `fetch`): `searchGroomerBusinesses` / `linkGroomerBusiness` POST to the right paths with the bearer token, map success, throw on error bodies.
- [ ] **Step 2–4:** red→green. **Step 5:** Commit.

## Task 5: AddYourBusiness UI + StaffDashboard wiring

- [ ] **Step 1:** Failing tests (mock `../api/groomerBusiness.js` + `requestGroomerMembership`):
  - typing + search renders candidate cards;
  - "This is my business" calls `linkGroomerBusiness` then `requestGroomerMembership(account, groomerId)` and shows a pending-review state;
  - errors surface inline;
  - `StaffDashboard` exposes the Add-business entry for an account without a verified membership.
- [ ] **Step 2:** Run, confirm fail. **Step 3:** Implement `AddYourBusiness.jsx` (uses the session access token from `useAuth`) + wire a screen toggle into the claim step. **Step 4:** Run, confirm pass.
- [ ] **Step 5:** Full suite + build; manual smoke (search a real business, add it, see it pending + appearing in customer search). **Step 6:** Commit.

---

## Definition of done

- [ ] A groomer can search Google, pick their business, and get a profile + pending membership without a seeded row.
- [ ] Adding an already-known business claims it (no duplicate) via `google_place_id` upsert.
- [ ] Endpoints require a valid session; the service-role key stays server-side.
- [ ] Full Vitest suite green; `npm run build` clean; manual smoke done.
- [ ] All commits pushed to `agent/a7b8c9d0` (not main / live).
