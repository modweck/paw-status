# ShinyPawz — Groomer Profile & Availability Editor Design

> **Status:** Approved design, ready for implementation planning
> **Date:** 2026-06-02
> **Repo:** `paw-status` (brand: ShinyPawz)
> **Branch:** `agent/a7b8c9d0`
> **Cluster:** Groomer side — sub-project **B** of A→B→C→D

---

## 1. Summary

Give verified groomers a self-service editor in the dashboard to manage the data
that drives real bookable slots: **business details** (name, salon, phone,
website, timezone, lead-time), **services/offerings** (duration + price),
**weekly hours**, and **time-off**. The DB tables and RLS for offerings, weekly
hours, and time-off already exist; this sub-project adds the editing UI + a thin
API layer, plus one migration so a verified groomer can update their own
`groomers` business row safely.

This is what makes the availability engine produce correct slots end-to-end —
it directly feeds the booking flow shipped earlier.

---

## 2. Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Scope | Business details + offerings + weekly hours + time-off | Full "manage your business" |
| Business details fields | name, salon, phone, website, timezone, lead-time | Slot-critical + contact |
| Address / lat-lng | **Excluded** (deferred to C) | Editing address without re-geocoding would desync coords/search |
| `groomers` self-update | New UPDATE policy (verified-membership gated) **+ column-level GRANT** allowlist | Mirrors the offerings policy + the appointment_requests column grant; prevents tampering with id/place_id/coords/rating |
| Data access | Direct table reads/writes under RLS (no RPCs) | RLS already enforces ownership for offerings/hours/time-off |
| Placement | Always-on section for verified groomers | Not gated by the request-handling feature flag |
| Multiple verified profiles | Profile selector | A groomer account can own more than one salon |

---

## 3. Architecture

### 3.1 Migration — `..._allow_verified_groomers_update_groomers.sql`

- `grant update on table groomers to authenticated;`
- UPDATE policy `"verified groomers update own groomer"` — `using` / `with check`
  the same verified-membership EXISTS clause used by the offerings policies.
- **Column-level GRANT** (the pattern used by `restrict_appointment_request_update_columns`):
  `grant update (name, salon, phone, website, timezone, lead_time_hours) on
  groomers to authenticated;`. Postgres then rejects any attempt to change
  columns outside that list (`id, google_place_id, lat, lng, location, rating,
  review_count, created_at`), so no trigger is needed. The service role keeps
  full update rights.

### 3.2 API modules (thin; validate at the boundary)

- `src/api/groomerProfile.js`
  - `loadGroomerProfile(supabase, groomerId)` → business fields.
  - `updateGroomerBusinessDetails(supabase, groomerId, fields)` → cleans + writes
    name/salon/phone/website/timezone/lead-time.
- `src/api/groomerOfferings.js`
  - `loadOfferings`, `createOffering`, `updateOffering`, `deleteOffering`.
- `src/api/groomerAvailability.js`
  - weekly hours: `loadWeeklyHours`, `createWeeklyHours`, `updateWeeklyHours`, `deleteWeeklyHours`.
  - time-off: `loadTimeOff`, `createTimeOff`, `deleteTimeOff`.

**Validation rules** (throw user-facing errors before writing):
- offering `duration_minutes` positive int; `base_price_cents` ≥ 0 when present;
  `service` non-empty.
- weekly hours `day_of_week` 0–6; `open_time < close_time`; **no overlapping
  window** for the same groomer + day (app-layer per the migration contract).
- time-off `start_at < end_at`.
- business details: timezone is a valid IANA name (validate against
  `Intl.supportedValuesOf('timeZone')` when available, else a format check);
  `lead_time_hours` ≥ 0; website is a URL or empty; trim text.

### 3.3 UI — `src/groomer/`

- `GroomerProfileManager.jsx` — container. Picks the active verified membership
  (selector when >1), loads profile + offerings + hours + time-off, renders the
  four editors, and refreshes on change.
- `BusinessDetailsForm.jsx`, `OfferingsEditor.jsx`, `WeeklyHoursEditor.jsx`,
  `TimeOffEditor.jsx` — each owns its section's add/edit/delete + inline errors.

### 3.4 Dashboard wiring — `src/groomer/StaffDashboard.jsx`

Render `GroomerProfileManager` in `GroomerWorkspace` whenever there is at least
one verified membership, independent of `isStaffDashboardEnabled()`.

---

## 4. Files

**New**
- `supabase/migrations/<ts>_allow_verified_groomers_update_groomers.sql`
- `src/api/groomerProfile.js` (+ test)
- `src/api/groomerOfferings.js` (+ test)
- `src/api/groomerAvailability.js` (+ test)
- `src/groomer/GroomerProfileManager.jsx` (+ test)
- `src/groomer/BusinessDetailsForm.jsx` (+ test)
- `src/groomer/OfferingsEditor.jsx` (+ test)
- `src/groomer/WeeklyHoursEditor.jsx` (+ test)
- `src/groomer/TimeOffEditor.jsx` (+ test)

**Modified**
- `src/groomer/StaffDashboard.jsx` (+ its test) — mount the manager for verified groomers.

---

## 5. Testing

- **API** (mocked Supabase): each CRUD builds the right query/row; validation
  rejects bad input before any write; overlap detection for weekly hours.
- **Components**: render existing data; add/edit/delete flows call the API;
  inline validation messages; profile selector switches the active groomer.
- **StaffDashboard**: the manager shows for a verified membership and is absent
  for pending-only accounts.
- **Migration**: policy + trigger objects exist; a non-allowlisted column change
  is rejected (documented manual/SQL check).

---

## 6. Non-goals

- Address / geocoding edits (sub-project C — Google Places).
- Booking-channel / calendar-connection editing (separate slice).
- Notifications (sub-project D).
- Any change to the slot-computation engine itself (it already reads these tables).

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Groomer tampering with rating/place_id/coords via the new UPDATE policy | Column-level GRANT allowlist; service role keeps full rights |
| Overlapping weekly windows corrupt slot math | App-layer overlap validation on create/update |
| Editing applies to the wrong salon (multi-profile) | Explicit profile selector; all writes carry the selected `groomerId` |
| Invalid timezone breaks slot times | Validate IANA timezone before save |
| Address edits desync coords | Address excluded from B; handled in C with geocoding |
