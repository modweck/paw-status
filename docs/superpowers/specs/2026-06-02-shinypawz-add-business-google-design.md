# ShinyPawz — Find & Add Your Business via Google Design

> **Status:** Approved design, ready for implementation planning
> **Date:** 2026-06-02
> **Repo:** `paw-status` (brand: ShinyPawz)
> **Branch:** `agent/a7b8c9d0`
> **Cluster:** Groomer side — sub-project **C** of A→B→C→D

---

## 1. Summary

Let a groomer find their business on Google and create/claim their ShinyPawz
profile from it, instead of only being able to claim a pre-seeded row. They
search by business name, pick the match (with photo/address/rating), and the
server creates the `groomers` row from Google's data; a pending membership is
then filed for admin verification (the existing trust gate).

Lightweight: Google **Places** lookup only — no Google Business Profile OAuth.

---

## 2. Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Scope | Find + add/link via Google Places; no OAuth | Covers "lookup / add / link business" without the OAuth lift |
| Visibility of new row | Appears in customer search immediately | User choice; simplest |
| Edit rights | Pending membership → admin verifies (existing flow) | Keeps the trust gate |
| Row creation | **Server-side, service role** | `groomers` has no client INSERT, and place_id/coords are not groomer-writable by design |
| Membership | Client calls the **existing** `requestGroomerMembership` after the row exists | Reuse; least new surface |
| Dedupe | **Upsert on `google_place_id`** | "Add" silently claims an already-seeded/added business instead of duplicating |
| Placement | Separate "Add your business" screen in groomer onboarding | User choice |
| Auth on endpoints | Require `Authorization: Bearer <session token>` | Protect the Google key + row creation |
| Migration | **None** | Service role bypasses RLS for the insert |

---

## 3. Architecture

### 3.1 Server — business search
`apps/web/server/googlePlaces.js` gains `searchBusinesses({ query, near, env, fetchImpl })`
using Places **Text Search** (`places:searchText`, the API `seed-groomers.js`
already uses), returning candidates `{ placeId, name, address, rating, reviewCount }`.

### 3.2 Server — create/link the profile
`apps/web/server/groomerBusiness.js`:
- `searchGroomerBusinesses({ accessToken, query, near, env, fetchImpl })` — verify
  the session, then `searchBusinesses(...)`.
- `linkGroomerBusinessFromPlace({ accessToken, placeId, env, fetchImpl, supabaseAdmin })`:
  1. verify the caller's session (Supabase `auth.getUser(token)`),
  2. fetch Place **Details** (name, formattedAddress, lat/lng, phone, website,
     rating, userRatingCount),
  3. **upsert** a `groomers` row on `google_place_id` (service role), computing
     `location` as `SRID=4326;POINT(lng lat)`,
  4. return the mapped groomer `{ id, name, address, ... }`.
- A `requireGroomerSession(accessToken, env)` helper mirrors the admin
  authorization pattern (`apps/api/src/admin/adminAuthorization.js`).

### 3.3 HTTP endpoints
- `apps/web/netlify/functions/groomer-business-search.js` → POST `/api/groomer-business-search`.
- `apps/web/netlify/functions/groomer-business-link.js` → POST `/api/groomer-business-link`.
- Matching Vite dev plugins in `apps/web/vite.config.js` (mirror `guestBookingDevPlugin`),
  forwarding `Authorization`.

### 3.4 Client API
`apps/web/src/api/groomerBusiness.js`:
- `searchGroomerBusinesses(accessToken, query)` → POST search.
- `linkGroomerBusiness(accessToken, placeId)` → POST link, returns the groomer row.

### 3.5 UI
`apps/web/src/groomer/AddYourBusiness.jsx`:
- search box → candidate cards (`GooglePlacePhoto` by `placeId`, name, address, rating),
- "This is my business" → `linkGroomerBusiness(...)` (server creates/returns the row)
  → then `requestGroomerMembership(supabase, account, groomer.id)` → "pending review" state.
- Wired into `StaffDashboard`: from the claim step, a toggle/button switches to
  this screen ("Can't find your business? Add it from Google").

---

## 4. Files

**New**
- `apps/web/server/groomerBusiness.js` (+ test)
- `apps/web/netlify/functions/groomer-business-search.js`
- `apps/web/netlify/functions/groomer-business-link.js`
- `apps/web/src/api/groomerBusiness.js` (+ test)
- `apps/web/src/groomer/AddYourBusiness.jsx` (+ test)

**Modified**
- `apps/web/server/googlePlaces.js` (+ test) — add `searchBusinesses`.
- `apps/web/vite.config.js` — dev plugins for the two endpoints.
- `apps/web/src/groomer/StaffDashboard.jsx` (+ test) — entry to the Add-business screen.

---

## 5. Testing

- **googlePlaces.searchBusinesses**: injected `fetchImpl` returns a Places
  Text Search payload → mapped candidates; error mapping.
- **groomerBusiness** (mock `fetchImpl` + a fake service-role client + auth):
  rejects without a valid session; on link, upserts the right row (incl. PostGIS
  `location`) and returns the mapped groomer; dedupe path returns the existing row.
- **client groomerBusiness**: posts to the right paths with the bearer token;
  maps responses; surfaces error bodies.
- **AddYourBusiness**: search renders candidates; selecting one calls link then
  `requestGroomerMembership`; shows pending state; surfaces errors.
- **StaffDashboard**: the Add-business entry shows for an account without a
  verified membership.

---

## 6. Non-goals

- Google Business Profile OAuth / token storage / review-post sync.
- Editing or re-linking an existing groomer's address/coords/place_id (admin/future).
- Refreshing rating/review_count from Google in-app (the `check-google-place-details.js` script already covers audits).
- Any change to the customer search/`nearby_groomers` function.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Spam/fake businesses created from Google | Auth required; edit rights gated by admin-verified membership; upsert dedupes by place_id |
| Google key abuse via open endpoint | Endpoints require a valid Supabase session bearer token |
| Duplicate rows for the same business | `google_place_id` is unique; server upserts on conflict |
| Coords/`location` desync | Always sourced from Google Place Details at create time; PostGIS point computed server-side |
| Service-role key exposure | Lives only in the Netlify function / server env, never shipped to the browser |
