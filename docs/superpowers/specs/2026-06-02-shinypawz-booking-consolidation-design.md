# ShinyPawz — Booking Flow Consolidation Design

> **Status:** Approved design, ready for implementation planning
> **Date:** 2026-06-02
> **Repo:** `paw-status` (brand: ShinyPawz)
> **Branch:** `agent/a7b8c9d0`
> **Scope:** Customer-side booking flow only (groomer side is a separate cluster)

---

## 1. Summary

The customer booking experience today is one long page with two near-duplicate
booking forms and no real step structure. This design consolidates it into a
**three-step screen flow** (search → results → booking) backed by a **single
adaptive booking form**, adds an **optional exact-time** request field, and
**prefills guest details** so returning guests stop retyping.

The guiding constraint, consistent with the demo-ready spec: **add no new
architectural patterns.** The step machine reuses the existing
history-based routing; the exact-time field reuses the existing
`preferred_windows` JSONB (no migration).

---

## 2. Problem statement

Observed issues this design resolves:

1. **Everything on one long page.** Search inputs, the groomer results list, the
   booking form, and the customer's existing-bookings list are all stacked in
   `CustomerApp`. `/bookings` and `/dogs` merely scroll to anchors on that same
   page — there is no real "second screen" after a search.
2. **Two duplicate booking forms.** `BookingRequestPanel.jsx` (signed-in, 376
   lines) and `GuestBookingPanel.jsx` (guest, 389 lines) share ~90% of their
   markup, service/groomer-selection effects, and timing fieldset. They drift.
3. **Guests retype everything.** The guest form collects name/email/phone + dog
   details fresh each visit; "Save this info for next time" only fires *after*
   submit and just emails a magic link — it does not carry the just-typed
   details forward.
4. **No specific time.** Timing is limited to a `first-available` checkbox plus
   preferred/backup **date + time-of-day window** (morning/afternoon/evening).
   There is no way to request an exact time.

---

## 3. Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Flow shape | Multi-step screens: search → results → booking | User wants the "push to second screen after search" behavior |
| Screen model | `step` state in `CustomerApp` + browser-history sync via `?step=` query param | Lowest risk; reuses the existing lightweight router; preserves search state in memory |
| Booking form | One adaptive `BookingForm` replaces both old panels | Kills the duplication; single source of truth |
| Exact time | **Optional** field that *supplements* the time-of-day window (still a request, groomer confirms) | No dependency on the in-progress availability/slots engine; backward-compatible |
| Guest booking | Keep guest path; **prefill** from `localStorage` | Reduce retyping without forcing accounts |
| "Your bookings" | Show only on the `/bookings` screen, not beside the booking form | Stops bookings appearing "in two places" |
| DB | No migration — exact time lives in existing `preferred_windows` JSONB | Old rows without `time` stay valid |

---

## 4. Architecture

### 4.1 Step machine (`CustomerApp.jsx`)

Add `step: 'search' | 'results' | 'booking'`. Render exactly one screen:

| Step | Renders | Advances on |
|---|---|---|
| `search` | Hero + search form (address, radius, service, dog size) | Successful search → `results` |
| `results` | Groomer list + "Popular near you" + "edit search" (back) | Pick a groomer (Book button / popular card) → `booking` |
| `booking` | `BookingForm` for `selectedGroomer` + "back to results" + confirmation | Submit → confirmation, link to `/bookings` |

- Step transitions call `window.history.pushState(..., '/?step=<step>')`. The
  pathname stays `/`, so `App.currentRoute` continues to resolve `customer` and
  is untouched.
- A `popstate` listener restores `step` from the `?step=` param, so the
  **Back button** moves between steps.
- Search state (address, coords, radius, service, dog size, groomer results,
  selected groomer) stays in `CustomerApp` memory — no refetch on step change.
- **Deep-link / refresh guards:** `?step=booking` with no `selectedGroomer` in
  memory (e.g. a fresh load) falls back to `search`. `?step=results` with no
  results falls back to `search`.

### 4.2 Single adaptive `BookingForm`

New `src/customer/BookingForm.jsx` replaces `BookingRequestPanel.jsx` and
`GuestBookingPanel.jsx`. It branches on auth state from `useAuth()`:

- **Signed-in mode:** dog `<select>` from saved profiles; groomer/service/size
  prefilled from the dog's preferences (preserves today's behavior). No contact
  fields. Submits via `createBookingRequest`.
- **Guest mode:** contact fields (name/email/phone) + dog fields, **prefilled**
  from `localStorage` (§4.4). Keeps the "sign in & save" nudge above the form.
  Submits via `createGuestBookingRequest`.

Extract shared, currently-duplicated pieces into focused components:

- `src/customer/GroomerServiceFields.jsx` — groomer `<select>` + service
  `<optgroup>` select, including `serviceOptionsForGroomer` /
  `chooseServiceForGroomer` logic (identical in both panels today).
- `src/customer/BookingTimingFieldset.jsx` — `first-available` checkbox +
  preferred/backup date + time-of-day + the new optional exact-time input.

### 4.3 Optional exact time

Extend the window shape in `src/api/bookingRequests.js`:

```
{ type: 'preferred-date' | 'backup-date', date: 'YYYY-MM-DD', timeOfDay: 'morning'|'afternoon'|'evening', time?: 'HH:MM' }
```

- `buildPreferredWindows(...)` accepts optional `preferredTime` / `backupTime`
  and includes `time` on the window only when provided.
- `normalizePreferredWindow(...)` validates `time` with `/^\d{2}:\d{2}$/` **only
  when present**; absent `time` remains valid (backward-compatible). Reject
  out-of-range values (`24:00`, `09:60`).
- UI: `BookingTimingFieldset` adds a "Preferred time (optional)" `type="time"`
  input next to the time-of-day select, with helper copy clarifying it is a
  request, not a guaranteed slot.
- **Server parity:** mirror the optional-`time` validation in
  `apps/web/server/guestBooking.js` and the netlify guest-booking function so
  the guest path validates identically server-side.

### 4.4 Guest prefill

- On successful guest submit, write `{ customerName, customerEmail,
  customerPhone, dogName, dogBreed, dogSize, dogNotes }` to `localStorage`
  under a single key (e.g. `shinypawz.guestBooking`).
- On `BookingForm` mount in guest mode, hydrate the form from that key.
- In-session dog size from search is still carried via the existing
  `selectedDogSize` prop.
- Stored values are only what the user typed; no behavior change for signed-in
  users.

### 4.5 "Your bookings" placement

- Move `BookingsListPanel` out of `CustomerOwnershipPanel` (where it currently
  renders beside the form) to the `/bookings` screen only.
- Narrow `CustomerOwnershipPanel` to the booking step: render `BookingForm`
  (plus the existing "create your customer profile" gating when no profile
  exists yet). Leave its other content (your-groomer, optional password
  sign-in, get-earlier-appointments) in place — **no unrelated refactor.**
- The post-submit confirmation links to `/bookings`.

---

## 5. Components & files

**New**

- `src/customer/BookingForm.jsx` — single adaptive booking form.
- `src/customer/GroomerServiceFields.jsx` — shared groomer + service selects.
- `src/customer/BookingTimingFieldset.jsx` — shared timing fieldset incl. exact time.

**Modified**

- `src/customer/CustomerApp.jsx` — step machine + screen rendering + history sync.
- `src/api/bookingRequests.js` — optional `time` in build/normalize windows.
- `src/customer/CustomerOwnershipPanel.jsx` — narrow to booking step; drop the embedded list.
- `apps/web/server/guestBooking.js` + the netlify guest-booking function — optional-`time` validation parity.

**Removed**

- `src/customer/BookingRequestPanel.jsx`
- `src/customer/GuestBookingPanel.jsx`
- (their tests fold into `BookingForm` tests)

---

## 6. Testing

- **Unit (`bookingRequests` ):** `buildPreferredWindows` with/without exact time;
  `normalizePreferredWindow` for present / absent / malformed `time`
  (`24:00`, `9:5`, `09:60`).
- **Component (`BookingForm`):** guest mode prefill-from-`localStorage` + submit;
  signed-in mode dog dropdown + no contact fields + submit; service/groomer
  selection effects.
- **Component (step machine):** search → results → booking transitions; Back
  button (`popstate`) returns to the previous step; deep-link/refresh fallbacks.
- **Server:** guest-booking validation accepts valid optional `time` and rejects
  malformed `time`.
- Existing suite stays green; old-panel tests are migrated, not deleted blind.

---

## 7. Non-goals / out of scope

- Real slot-based availability and conflict-checking (owned by `apps/api`; the
  exact-time field is a *request* only).
- Any groomer-side change (toggle, Google Business Profile, notifications) —
  separate cluster.
- The dog-onboarding-form overhaul (breed dropdown, required allergies,
  preferred-groomer search) — separate cluster.
- Authentication/role model changes beyond what shipped in Cluster 1.

---

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Step state desyncs from URL on Back/refresh | Single source: `?step=` param read on mount + `popstate`; fallbacks to `search` when prerequisites are missing |
| Removing both panels regresses behavior | Migrate their tests into `BookingForm`; keep the full suite green before/after |
| Exact-time breaks old `preferred_windows` rows | `time` is optional; normalize tolerates its absence; no migration |
| Client/server validation drift on `time` | Add the same regex/range check in `server/guestBooking.js` and the netlify function |
| Over-refactoring `CustomerOwnershipPanel` | Explicitly scoped: only move the list + render `BookingForm`; leave other sections untouched |
