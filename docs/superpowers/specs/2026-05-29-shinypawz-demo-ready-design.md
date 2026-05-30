# ShinyPawz — Demo-Ready Build Spec

> **Status:** Approved design, ready for implementation planning
> **Date:** 2026-05-29
> **Repo:** `paw-status` (brand: ShinyPawz)
> **Audience:** Two engineers bringing the prototype to a live-demoable state
> **Companion docs:** `README.md` (current state), `docs/PRO_LEVEL_ROADMAP.md`, `docs/POLISH_REWORK_TASKS.md`

---

## 1. Summary

ShinyPawz is a two-sided dog-grooming booking product (customers ↔ groomers) built on a Vite + React SPA, Supabase Postgres + RLS, and Netlify Functions. Today the booking model is **request-only**: it captures fuzzy "preferred windows" as `appointment_requests` with no real slots and no conflict-checking.

This spec takes the product to a **live-demoable** state by adding:

1. **Groomer self-service onboarding** — password signup → a 5-step wizard (business, location, services + pricing, availability, waitlist/extras).
2. **Real slot-based availability** — recurring weekly hours + per-service durations → concrete bookable slots computed on read, minus time-off and existing bookings.
3. **A real booking lifecycle** — customer picks a real slot → request → groomer Accept/Decline → **atomic** confirmation with database-level double-booking safety.
4. **Waitlist / "next available"** — per-groomer cancellation lists **and** a global next-available search, with a sequential time-limited offer/claim mechanic that auto-backfills freed slots.
5. **Mock integrations (back seat)** — Stripe deposit, Square Booking sync, and Google Business Profile "connect" as clean adapter interfaces with in-memory fakes (no real external calls).

The guiding constraint: **add no new architectural patterns.** Every piece lands in a seam the repo already has.

---

## 2. Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Integrations (Square/Stripe) | **Interface + mock only** | Self-contained demo, nothing to break on stage; real integration documented as a later phase. |
| Availability model | **Slot-based, computed on read** | Product-like UX (live time grid) with no materialized slot table or cron. |
| Demo auth | **Password-first**, magic link secondary | Instant account creation on stage; no email round-trip. |
| Groomer location | **Salon + mobile** (radius) | Realistic grooming market; both resolve to a lat/lng so geo-search still works. |
| Waitlist | **Both** — per-groomer cancellation list + global next-available | Per-groomer = offer/claim on cancellations; global = ranked cross-groomer slot search. |
| Environment | **Local `npm run dev` → hosted Supabase** | Real auth/RLS/persistence, zero deploy. Requires the hosted project's DB credentials to apply migrations. |
| Deposit placement | **At confirmation**, gated by off-by-default `groomers.requires_deposit` | Core flow has zero payment friction; deposit is opt-in. |
| Waitlist offers | **Sequential**, one next-in-line entry at a time, TTL roll-over | Fairer and easier to reason about than broadcast. |
| Notifications | **Supabase Realtime** in-app feed, polling fallback | Live "pop-in" on stage; no Twilio dependency. |

---

## 3. Current-state recap (what we build on)

- **Monorepo (npm workspaces):** `apps/web` is the only deployable app; `apps/api/src` holds backend logic (admin/* is live and wired; `booking/`, `integrations/`, `notifications/`, `runtime.js` are intentional stubs for exactly this work).
- **"One logic, two adapters":** shared server logic in `apps/web/server/` and `apps/api/src/` is wrapped by Netlify functions in prod and **mirrored by Vite dev plugins** (`apps/web/vite.config.js`) in dev. We extend both.
- **Three trust tiers** already in use:
  - Browser (publishable key) → **RLS**-constrained queries.
  - `SECURITY DEFINER` functions in an `app_private` schema (e.g., `current_user_verified_for_groomer`) → atomic / cross-boundary logic.
  - Server functions (service-role key) → privileged operations.
- **Existing tables:** `groomers`, `customers`, `dogs`, `appointments` (dormant), `appointment_requests`, `groomer_accounts`, `groomer_memberships`, `booking_channels`, `calendar_connections`, `groomer_membership_review_events`, `groomer_pricing`.
- **Config boundary:** `vite.config.js` injects only whitelisted public values into the bundle via the `__APP_CONFIG__` compile-time define; secrets never reach the client.
- **Testing:** Vitest + Testing Library, 30 colocated `*.test.{js,jsx}` files; rules target 80% coverage.

---

## 4. Architecture principles

### 4.1 Operation → mechanism assignment

Every new operation is assigned to one existing mechanism. **No new patterns.**

| Operation kind | Mechanism | Examples |
|---|---|---|
| **Reads with private inputs** (slot availability) | **Server endpoint** (service-role) → **pure JS engine** | `/api/availability`, `/api/next-available` |
| **Owner writes** (edit own rows) | **RLS-protected** insert/update via `api/*.js` | edit hours, pricing, blackouts; join waitlist; create request |
| **Cross-boundary / atomic writes** | **`SECURITY DEFINER` RPC** (`app_private` idiom) | `confirm_appointment_request`, `claim_waitlist_offer`, `cancel_appointment`, `create_owned_groomer` |
| **Privileged / external (mock)** | **Server function** (service-role) | mock Stripe deposit, Square sync, GBP connect |

### 4.2 Reads vs. writes split (the key refinement)

- **Slot *generation* is a pure JS engine** (`apps/api/src/booking/slots.js`). Reasons: (1) the hard date math (timezone, DST, lunch gaps, lead time, overlap subtraction) is exhaustively unit-testable in JS, matching the repo's test culture; (2) it must read **private** `groomer_time_off`, so it cannot be a browser call anyway — it runs behind a server endpoint with the service-role key and returns only free slots.
- **Mutations are `SECURITY DEFINER` RPCs** because they need a transaction + the GIST exclusion constraint. They are **client-callable** (the authenticated user calls `supabase.rpc(...)`; the function verifies authorization itself), so no service-role surface is added for them.

**Net:** hard *date logic* lives in testable JS; hard *concurrency* lives in atomic SQL.

---

## 5. Data model

> DDL below is **illustrative of intended shape**; final migration SQL is written during implementation. Follow existing conventions: `uuid` PKs `default gen_random_uuid()`, `timestamptz default now()`, snake_case, one timestamped migration per logical group, PostGIS `geography(Point,4326)` for locations.

### 5.1 Changed tables

#### `groomers` (added columns)
```sql
alter table public.groomers
  add column location_mode text not null default 'salon'
    check (location_mode in ('salon','mobile')),
  add column service_radius_meters integer,            -- required when mobile
  add column owner_account_id uuid references public.groomer_accounts(id),
  add column accepts_waitlist boolean not null default false,
  add column booking_lead_time_hours integer not null default 2,
  add column requires_deposit boolean not null default false,
  add column timezone text not null default 'America/New_York',
  add column bio text;
-- address/lat/lng/location already exist; serve both modes
-- (mobile = base point; salon = salon address point)
```

#### `appointments` (promoted to the real confirmed-booking record)
```sql
alter table public.appointments
  add column appointment_request_id uuid references public.appointment_requests(id),
  add column customer_id uuid references public.customers(id),
  add column service_id text,
  add column duration_minutes integer not null default 60,
  add column price_cents integer;
-- existing: id, dog_id, groomer_id, service, scheduled_at, status, status_updated_at, created_at

-- Double-booking safety: no two ACTIVE appointments for one groomer may overlap.
alter table public.appointments
  add constraint appointments_no_overlap
  exclude using gist (
    groomer_id with =,
    tstzrange(scheduled_at, scheduled_at + (duration_minutes || ' minutes')::interval) with &&
  ) where (status in ('booked','checked_in','bathing','drying','almost_ready','ready_for_pickup'));
-- requires btree_gist extension for the `groomer_id with =` equality element
```

#### `appointment_requests` (concrete chosen slot)
```sql
alter table public.appointment_requests
  add column requested_slot_at timestamptz,
  add column requested_duration_minutes integer,
  add column service_id text;
-- preferred_windows stays nullable for guest/back-compat;
-- the slot-based flow uses requested_slot_at.
```

### 5.2 New tables

#### `groomer_service_offerings` — booking source of truth
```sql
create table public.groomer_service_offerings (
  id uuid primary key default gen_random_uuid(),
  groomer_id uuid not null references public.groomers(id) on delete cascade,
  service_id text not null,                 -- matches data/services.js ids
  duration_minutes integer not null check (duration_minutes > 0),
  price_cents integer not null check (price_cents >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (groomer_id, service_id)
);
-- Onboarding keeps groomers.services (jsonb) in sync so nearby_groomers filter works.
-- groomer_pricing remains for display/extracted ranges.
```

#### `groomer_availability` — recurring weekly hours
```sql
create table public.groomer_availability (
  id uuid primary key default gen_random_uuid(),
  groomer_id uuid not null references public.groomers(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),   -- 0=Sunday
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
-- Multiple rows per weekday model lunch breaks (e.g. 09:00-12:00 and 13:00-17:00).
create index on public.groomer_availability (groomer_id, weekday);
```

#### `groomer_time_off` — vacation / blackout (private)
```sql
create table public.groomer_time_off (
  id uuid primary key default gen_random_uuid(),
  groomer_id uuid not null references public.groomers(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on public.groomer_time_off (groomer_id, starts_at);
```

#### `waitlist_entries` — one row per waiting customer
```sql
create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  dog_id uuid not null references public.dogs(id) on delete cascade,
  groomer_id uuid references public.groomers(id) on delete cascade,  -- NULL = global
  service_id text not null,
  search_lat double precision,        -- for global matching
  search_lng double precision,
  max_distance_meters integer,        -- for global matching
  desired_after timestamptz,          -- optional acceptable window
  desired_before timestamptz,
  status text not null default 'active'
    check (status in ('active','offered','fulfilled','cancelled','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.waitlist_entries (groomer_id, status, created_at);
create index on public.waitlist_entries (customer_id, status);
```

#### `waitlist_offers` — the time-limited offer/claim
```sql
create table public.waitlist_offers (
  id uuid primary key default gen_random_uuid(),
  waitlist_entry_id uuid not null references public.waitlist_entries(id) on delete cascade,
  groomer_id uuid not null references public.groomers(id) on delete cascade,
  slot_at timestamptz not null,
  duration_minutes integer not null,
  service_id text not null,
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','claimed','declined','expired')),
  created_at timestamptz not null default now()
);
create index on public.waitlist_offers (waitlist_entry_id, status);
create index on public.waitlist_offers (groomer_id, status);
```

#### `payment_intents` — mock Stripe
```sql
create table public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments(id) on delete set null,
  appointment_request_id uuid references public.appointment_requests(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  provider text not null default 'stripe' check (provider in ('stripe')),
  kind text not null check (kind in ('deposit','full')),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'USD',
  status text not null default 'requires_payment'
    check (status in ('requires_payment','succeeded','failed','refunded')),
  external_ref text,                  -- fake "pi_..." id
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

#### `groomer_integrations` — fake GBP / Square / Stripe connect state
```sql
create table public.groomer_integrations (
  id uuid primary key default gen_random_uuid(),
  groomer_id uuid not null references public.groomers(id) on delete cascade,
  provider text not null
    check (provider in ('google_business_profile','square','stripe')),
  status text not null default 'not_connected'
    check (status in ('not_connected','connected','error')),
  external_id text,
  metadata jsonb not null default '{}'::jsonb,   -- fake rating/photos/etc.
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  unique (groomer_id, provider)
);
```

#### `notifications` — in-app feed
```sql
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_auth_user_id uuid not null,         -- auth.users.id
  kind text not null
    check (kind in ('booking_requested','booking_confirmed','booking_declined',
                    'waitlist_offer','waitlist_claimed','appointment_cancelled')),
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,       -- ids for deep-linking
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (recipient_auth_user_id, created_at desc);
```

### 5.3 RLS posture

> Reuse the existing `app_private.current_user_verified_for_groomer(...)` helper and `(select auth.uid())` wrapping.

| Table | SELECT | INSERT / UPDATE |
|---|---|---|
| `groomer_service_offerings` | **public** | verified groomer for `groomer_id` |
| `groomer_availability` | **public** | verified groomer |
| `groomer_integrations` | **public** (status/badge) | verified groomer |
| `groomer_time_off` | groomer-only (private) | verified groomer |
| `appointments` | owning customer (via dog) + verified groomer | **`confirm_appointment_request` / `claim_waitlist_offer` RPC only** (no direct insert) |
| `waitlist_entries` | owner customer + targeted groomer (or in-range global) | customer owns; status via RPC |
| `waitlist_offers` | entry-owner customer + offering groomer | **`claim_waitlist_offer` RPC only** |
| `payment_intents` | owner customer | server / `SECURITY DEFINER` only |
| `notifications` | recipient only (`recipient_auth_user_id = (select auth.uid())`) | server / `SECURITY DEFINER` only |

### 5.4 Migration list (ordered)

1. `*_add_groomer_location_and_booking_config.sql` — `groomers` new columns + `btree_gist`.
2. `*_add_groomer_offerings_and_availability.sql` — `groomer_service_offerings`, `groomer_availability`, `groomer_time_off` + RLS.
3. `*_promote_appointments_to_real_bookings.sql` — `appointments` columns + GIST exclusion + RLS; `appointment_requests` slot columns.
4. `*_add_waitlist.sql` — `waitlist_entries`, `waitlist_offers` + RLS.
5. `*_add_notifications_and_integrations.sql` — `notifications`, `groomer_integrations`, `payment_intents` + RLS.
6. `*_add_booking_rpcs.sql` — `create_owned_groomer`, `confirm_appointment_request`, `claim_waitlist_offer`, `cancel_appointment`, `offer_waitlist_slot` (all `SECURITY DEFINER`, search_path pinned). **These may be authored as several smaller timestamped migrations** as each RPC's table dependencies land across Phases 2–4 (e.g. `create_owned_groomer` in Phase 2, `confirm`/`cancel` in Phase 3, `claim`/`offer` in Phase 4) — see Section 17.

---

## 6. The slot engine (pure JS)

**File:** `apps/api/src/booking/slots.js` — deterministic, no I/O, no `Date.now()` (inject `nowIso`).

```js
/**
 * @typedef {{ weekday:number, startTime:string, endTime:string }} AvailabilityBlock  // 'HH:MM'
 * @typedef {{ startsAt:string, endsAt:string }} TimeOff                              // ISO
 * @typedef {{ scheduledAt:string, durationMinutes:number }} BusyAppointment          // ISO
 * @typedef {{ slotAt:string, durationMinutes:number }} Slot                          // ISO
 */

/**
 * Generate bookable slots for ONE groomer + ONE service.
 * @returns {Slot[]} ordered ascending
 */
export function generateSlots({
  fromIso, toIso, timezone, durationMinutes, leadTimeHours,
  availability,   // AvailabilityBlock[]
  timeOff,        // TimeOff[]
  busy,           // BusyAppointment[]
  nowIso,
}) { /* ... */ }
```

**Algorithm**
1. `earliest = now + leadTimeHours`. Clamp the window to `[max(from, earliest), min(to, now + HORIZON_DAYS)]`.
2. For each calendar date in range **in `timezone`**: for each `availability` block on that weekday, step from `startTime` by `durationMinutes` while `start + duration ≤ endTime`.
3. Combine `date + localTime` **in `timezone`** → a `timestamptz` instant (this is where DST is handled — via a **dependency-free `Intl.DateTimeFormat` helper** in `apps/api/src/booking/timezone.js`; no new runtime dependency. See `docs/superpowers/plans/2026-05-29-shinypawz-phase1-foundation.md` Task 2).
4. Drop a candidate if it overlaps any `timeOff` range or any `busy` appointment range (`[a,a+dur) ∩ [b,b+dur) ≠ ∅`), or starts before `earliest`.
5. Return the survivors, ascending.

**Cross-groomer helper**
```js
export function earliestSlots(perGroomerInputs, limitPerGroomer) // -> Slot[] per groomer
```
Used by `/api/next-available` to compute each candidate groomer's soonest N slots before merge/rank.

**Edge cases to unit-test:** DST spring-forward/fall-back day; lunch-break gap; lead-time cutoff trims today; a `busy` appointment splits a block; time-off covering a whole day; mobile-radius match/no-match; empty availability; `to < from`.

**Constants** (`apps/api/src/booking/constants.js`): `HORIZON_DAYS = 30`, `NEXT_AVAIL_HORIZON_DAYS = 14`, `OFFER_TTL_MINUTES = 60`.

---

## 7. RPC contracts (`SECURITY DEFINER`)

All pin `search_path`, wrap `auth.uid()` as `(select auth.uid())`, and raise friendly `errcode`/message on failure.

### `create_owned_groomer(...) returns groomers`
- **Caller:** authenticated groomer (has a `groomer_account`).
- **Does:** insert a `groomers` row (`owner_account_id = my account`, `location_mode`, base point) **and** a `groomer_memberships` row with `role='owner', status='verified'` — atomic. Self-created businesses skip admin review; claiming a *pre-existing* listing still uses the existing pending→verified admin flow.
- **Returns:** the new groomer row (so the wizard has `groomer_id` for steps 2–5).

### `confirm_appointment_request(p_request_id uuid, p_slot_at timestamptz default null) returns appointments`
- **Auth:** caller must be **verified** for the request's `groomer_id`.
- **Does:** `slot_at = coalesce(p_slot_at, request.requested_slot_at)`; read duration/price from the offering; **insert** `appointments` (GIST guards overlap); set request `status='confirmed'`; insert a `booking_confirmed` notification for the customer. One transaction.
- **Errors:** exclusion violation (`23P01`) → raise `slot_taken` → "That time was just booked — pick another."

### `claim_waitlist_offer(p_offer_id uuid) returns appointments`
- **Auth:** caller owns the entry.
- **Does:** assert offer `pending` and `now() < expires_at`; insert `appointments` (GIST guard); set offer `claimed`, entry `fulfilled`; notify groomer (`waitlist_claimed`).
- **Errors:** expired/taken → `offer_unavailable`.

### `cancel_appointment(p_appointment_id uuid, p_reason text default null) returns void`
- **Auth:** owning customer (via dog) **or** verified groomer.
- **Does:** set `status='cancelled'`; notify the other party (`appointment_cancelled`); **backfill** — select the oldest `active` `waitlist_entries` matching this groomer (or a global entry whose `max_distance_meters` covers the groomer) + compatible service + (slot within desired window or window null); if found, create a `waitlist_offers` (`slot_at = freed slot`, `expires_at = now()+OFFER_TTL_MINUTES`), set entry `offered`, notify that customer (`waitlist_offer`).

### `offer_waitlist_slot(p_groomer_id uuid, p_slot_at timestamptz, p_service_id text) returns waitlist_offers`
- **Auth:** verified groomer for `p_groomer_id`.
- **Does:** the groomer's manual "I have an opening" button — same offer-to-next-entry mechanic without a cancellation.

> A scheduled sweep to expire stale offers is **out of scope** for the demo; offers are checked for expiry at claim time, and `OFFER_TTL_MINUTES = 60` comfortably outlives a live demo. (Documented as a post-demo follow-up: a cron/edge function to roll expired offers to the next entry automatically.)

---

## 8. Server endpoints (Netlify function + Vite dev plugin)

Each new endpoint is added in **both** `apps/web/netlify/functions/` and as a matching `apps/web/vite.config.js` dev plugin, plus a `netlify.toml` redirect — following the existing pattern exactly.

| Route | Method | Key | Backed by |
|---|---|---|---|
| `/api/availability` | GET `?groomerId&serviceId&from&to` | service-role (reads private time-off) | `slots.generateSlots` |
| `/api/next-available` | POST `{lat,lng,radiusM,serviceId,limit}` | service-role | candidate query + `slots.earliestSlots` |
| `/api/payment-intent` | POST (mock deposit) | service-role | `integrations/stripe.js` fake |
| `/api/gbp-connect` | POST (mock) | service-role | `integrations/gbp` fake |
| `/api/square-sync` | POST (mock, optional) | service-role | `integrations/square.js` fake |

Mutations (`confirm_*`, `claim_*`, `cancel_*`, `offer_*`, `create_owned_groomer`) are **not** endpoints — they are `supabase.rpc(...)` calls from the client.

---

## 9. Client `api/` modules

New modules in `apps/web/src/api/`, each following the existing `map*Row` + `throw Error(message)` idiom, each with a colocated `.test.js`.

| Module | Functions |
|---|---|
| `availability.js` | `fetchAvailableSlots({groomerId, serviceId, from, to})`, `fetchNextAvailable({lat,lng,radiusM,serviceId,limit})` |
| `appointments.js` | `confirmRequest({requestId, slotAt})` → rpc; `declineRequest({requestId, note})`; `cancelAppointment({appointmentId, reason})` → rpc; `loadGroomerSchedule(...)`, `loadCustomerAppointments(...)` |
| `groomerOnboarding.js` | `createOwnedGroomer(...)` → rpc; `saveOffering(...)`, `saveAvailabilityBlock(...)`, `saveTimeOff(...)`, `setWaitlistOptIn(...)` |
| `waitlist.js` | `joinWaitlist(...)`, `loadMyWaitlist(...)`, `loadGroomerWaitlist(...)`, `offerSlot(...)` → rpc, `claimOffer({offerId})` → rpc |
| `notifications.js` | `loadNotifications(...)`, `markRead(...)`, `subscribeNotifications(onInsert)` (Realtime) |
| `gbp.js` | `connectGbp({groomerId})` (mock), `loadIntegrations({groomerId})` |
| `payments.js` | `createDepositIntent({appointmentId})` (mock), `loadPaymentStatus(...)` |

---

## 10. Flows (end to end)

### Flow 1 — Groomer signup → onboarding
```
LoginPanel ("I'm a groomer") → password signup → groomer_account row
→ OnboardingWizard:
   Step 1 Business basics ──(create_owned_groomer RPC)──► groomer_id (+ verified owner membership)
   Step 2 Location: salon(address→geocode) | mobile(base→geocode + radius)
   Step 3 Services: pick from data/services.js → set duration+price → groomer_service_offerings (+sync services jsonb)
   Step 4 Availability: weekly grid → groomer_availability; set booking_lead_time_hours
   Step 5 Waitlist+extras: accepts_waitlist toggle; optional "Connect GBP" (mock); requires_deposit toggle
→ StaffDashboard (populated)
```

### Flow 2 — Customer discovery → booking
```
Search (nearby_groomers, now shows real prices + availability badge)
→ GroomerDetailPanel → SlotPicker: pick service → /api/availability → tap a real slot
→ create appointment_request (requested_slot_at, service_id)  [RLS insert via owned dog]
→ notification 'booking_requested' to groomer
```

### Flow 3 — Groomer Accept / Decline
```
StaffDashboard ▸ Requests (shows requested slot)
  Accept  → confirm_appointment_request RPC → appointments row (atomic) + request 'confirmed'
            → if requires_deposit: DepositModal → /api/payment-intent (mock) → succeeded
            → notification 'booking_confirmed' to customer
  Decline → request 'declined' (+ note) → notification 'booking_declined'
  (slot raced) → friendly 'slot_taken' → request stays open to propose another
```

### Flow 4 — Waitlist (both modes)
```
Per-groomer: groomer full/no fit → "Join waitlist" → waitlist_entries(groomer_id set)
Global:      NextAvailablePanel →
               (a) book soonest now: /api/next-available → pick → request flow, OR
               (b) "notify me anywhere": waitlist_entries(groomer_id NULL, search_lat/lng, radius)

Backfill loop:
  cancel_appointment (or offer_waitlist_slot)
     → next matching active entry gets waitlist_offers (expires_at = now+TTL)
     → NotificationBell 'waitlist_offer' + "Claim by HH:MM"
     → claim_waitlist_offer RPC → appointments (atomic) → entry 'fulfilled'
     (expired/declined → rolls to next entry on the next cancellation/offer)
```

```
        ┌─────────────┐   cancels    ┌──────────────────┐
        │ Appointment │ ───────────► │ cancel_appointment│
        └─────────────┘              └────────┬─────────┘
                                              │ finds oldest matching entry
                                              ▼
                                     ┌──────────────────┐  notify  ┌──────────────┐
                                     │  waitlist_offer   │ ───────► │ NotificationBell│
                                     │  (TTL countdown)  │          └──────┬───────┘
                                     └──────────────────┘                 │ claim
                                              ▲                            ▼
                                              │           ┌────────────────────────┐
                                       expired│           │ claim_waitlist_offer    │
                                       → next │           │ → new Appointment (atomic)│
                                              └───────────└────────────────────────┘
```

### Flow 5 — Payments (mock, opt-in)
`groomers.requires_deposit = true` → at confirmation, `DepositModal` (mock card form, no real card) → `/api/payment-intent` → `stripe.js` fake creates `payment_intents` and returns `succeeded`. Default off, so the core demo flows with no payment step.

### Flow 6 — GBP / Square (mock)
"Connect GBP" → `/api/gbp-connect` → `groomer_integrations(provider='google_business_profile', status='connected', metadata={rating,reviews,photos})` → a "Google-verified" badge on the groomer. `square.js` exposes `pushBooking()` / `syncAvailability()` that write a fake external ref on confirm — demonstrating the seam, no real calls.

---

## 11. Frontend components

### Routing (`apps/web/src/App.jsx`)
- Extend `currentRoute`: `/groomer` → if the user has **no verified membership**, render `OnboardingWizard`; else `StaffDashboard`.
- `LoginPanel` gains an **"I'm a groomer"** intent toggle. `/`, `/dogs`, `/bookings`, `/account`, `/admin` unchanged.

### Groomer (`apps/web/src/groomer/`)
| Component | Responsibility |
|---|---|
| `onboarding/OnboardingWizard.jsx` | Step orchestration, progress, per-step validation gating. |
| `onboarding/Step{Business,Location,Services,Availability,WaitlistExtras}.jsx` | The 5 steps. |
| `AvailabilityEditor.jsx` | Weekly hours grid; add/remove blocks per weekday. Reused in onboarding + settings. |
| `ServiceOfferingsEditor.jsx` | Pick services from `data/services.js`, set duration + price. |
| `BlackoutEditor.jsx` | Add/remove `groomer_time_off`. |
| `WaitlistInbox.jsx` | Opted-in groomer: see entries; "offer a slot" button. |
| `GroomerSettingsPanel.jsx` | Profile, location, GBP connect, `requires_deposit`, `accepts_waitlist`. |
| `StaffDashboard.jsx` (extend) | Tabs: Requests (Accept/Decline), Schedule, Availability, Waitlist, Settings. |

### Customer (`apps/web/src/customer/`)
| Component | Responsibility |
|---|---|
| `SlotPicker.jsx` | Service select + day/time grid from `/api/availability`. |
| `GroomerDetailPanel.jsx` | Offerings/prices/availability badge + `SlotPicker` + Join Waitlist. |
| `NextAvailablePanel.jsx` | Global next-available search / "notify me anywhere". |
| `DepositModal.jsx` | Mock card form at confirmation. |
| `BookingsListPanel.jsx` (extend) | Confirmed appointments, pending requests, waitlist offers w/ Claim CTA. |

### Shared (`apps/web/src/layout/`)
| Component | Responsibility |
|---|---|
| `NotificationBell.jsx` | Realtime subscription on `notifications`; unread count; mark-read; deep-link via `data`. Added to `AppShell` top bar. |

---

## 12. Integration adapters (mock)

**`apps/api/src/integrations/stripe.js`**
```js
// Interface designed for a real Stripe drop-in later.
export function createStripeAdapter({ /* deps */ }) {
  return {
    async createDepositIntent({ appointmentId, amountCents }) {
      // FAKE: insert payment_intents(status='succeeded', external_ref='pi_demo_...'); return it
    },
  };
}
```

**`apps/api/src/integrations/square.js`**
```js
export function createSquareAdapter() {
  return {
    async pushBooking(appointment) { /* FAKE: return { externalRef: 'sq_demo_...' } */ },
    async syncAvailability(groomerId) { /* FAKE no-op */ },
  };
}
```

**GBP** (`integrations/providerConfirmations.js` or a small `integrations/gbp.js`): `connect({groomerId})` → write `groomer_integrations` connected with fake `external_id` + `metadata`.

All three are wired through `apps/api/src/integrations/providerConfirmations.js` (currently a stub) and exposed only via the mock server endpoints. **No real network calls.** Each real integration is documented as a later phase at the adapter boundary.

---

## 13. Notifications (Realtime)

- RPCs and server functions `insert` into `notifications`.
- `NotificationBell` calls `notifications.subscribeNotifications(onInsert)` → a Supabase Realtime channel filtered to `recipient_auth_user_id = current user`; falls back to a 30s poll if the channel errors.
- Marking read = `update notifications set read_at = now()` (RLS: recipient only).

---

## 14. Error handling

- `api/*` throws `Error(message)`; components `catch → setError(message)` (existing idiom).
- GIST exclusion (`23P01`) in `confirm`/`claim` → mapped to **"That time was just booked — pick another."** Request/entry stays open.
- Expired offer → **"This offer expired."** Entry returns to `active`.
- Wizard boundary validation gates Next/Finish: required fields, `price_cents > 0`, `end_time > start_time`, `service_radius_meters > 0` when mobile, ≥1 active service, ≥1 availability block.
- Server endpoints keep using existing `toPublic*` masking helpers; raw Supabase/Google errors never reach the client.
- Mock adapters never throw network errors (no network).

---

## 15. Security & RLS checklist

- [ ] Every new table has explicit RLS policies (Section 5.3); default-deny verified.
- [ ] `groomer_time_off`, `payment_intents`, `notifications` are **not** publicly readable.
- [ ] `appointments` / `waitlist_offers` have **no direct INSERT** policy — only via `SECURITY DEFINER` RPCs.
- [ ] All RPCs pin `search_path` and wrap `auth.uid()` in `(select auth.uid())`.
- [ ] GIST exclusion constraint present and active-status-scoped.
- [ ] Service-role key used only in server endpoints; never in `__APP_CONFIG__` whitelist.
- [ ] Flesh out `scripts/supabase-hardening-checks.js` with probes: anon cannot read time-off/notifications/payments; customer cannot read another customer's appointments; non-verified groomer cannot confirm.

---

## 16. Testing strategy

**Targets:** 80% (per repo rules). Vitest + Testing Library, colocated.

- **Unit — engine (highest value):** `slots.test.js` covering all edge cases in Section 6.
- **Unit — mappers/validators:** every new `map*Row` and the wizard validators.
- **Component:** wizard step validation/navigation; `SlotPicker` render + select; Accept/Decline call the right `supabase.rpc` (mock client); `BookingsListPanel` status rendering; `NotificationBell` render + mark-read; `NextAvailablePanel` results.
- **RPC integrity (no DB in Vitest):** assert `api` wrappers call `supabase.rpc` with correct args; the SQL functions themselves verified via the hardening-check probes + the manual runbook.
- **Demo runbook (Section 18):** the scripted happy path, run before any demo. Playwright E2E is a post-demo follow-up.

Add the test globs already in `vite.config.js` (`src/**`, `server/**`, `../api/src/**`) — `apps/api/src/booking/slots.test.js` is already covered by the `../api/src/**` include.

---

## 17. Build phases & task breakdown

Two engineers can parallelize on the **groomer seam (A)** and **customer seam (B)** after Phase 1 lands.

### Phase 1 — Foundation (shared; blocks everything)
1. Migrations 1–3 (location/config, offerings/availability/time-off, appointments + GIST + request slot cols).
2. `slots.js` engine + exhaustive unit tests.
3. `/api/availability` endpoint + Vite dev plugin + `netlify.toml` redirect.
4. `api/availability.js` client module + tests.

### Phase 2 — Groomer onboarding (Eng A)
5. Migration 6 partial: `create_owned_groomer` RPC.
6. `LoginPanel` "I'm a groomer" intent + `/groomer` routing branch.
7. `OnboardingWizard` + 5 steps; `AvailabilityEditor`, `ServiceOfferingsEditor`.
8. `groomerOnboarding.js` + tests.

### Phase 3 — Booking (Eng B), depends on Phase 1
9. Migration 6: `confirm_appointment_request`, `cancel_appointment`.
10. `SlotPicker`, `GroomerDetailPanel`; create-request flow.
11. `StaffDashboard` Requests tab (Accept/Decline); `appointments.js` + tests.
12. `notifications` table + `NotificationBell` + Realtime; `notifications.js`.

### Phase 4 — Waitlist (Eng A + B), depends on Phase 3
13. Migration 4 (`waitlist_entries`, `waitlist_offers`) + RLS.
14. `claim_waitlist_offer`, `offer_waitlist_slot` RPCs; backfill wired into `cancel_appointment`.
15. `/api/next-available` endpoint + engine `earliestSlots`.
16. `NextAvailablePanel`, `WaitlistInbox`, `BookingsListPanel` Claim CTA; `waitlist.js` + tests.

### Phase 5 — Integrations (back seat), depends on Phase 3
17. Migration 5 (`payment_intents`, `groomer_integrations`).
18. `stripe.js` / `square.js` / GBP fakes + mock endpoints; `DepositModal`, GBP connect button.
19. `payments.js`, `gbp.js` + tests.

### Cross-cutting (close-out)
20. `BlackoutEditor`, `GroomerSettingsPanel`.
21. Hardening-check probes; coverage pass to 80%.
22. Demo seed helper (optional onboarded groomer).

---

## 18. Demo runbook (scripted happy path)

Run after `npm install && npm run dev` against the hosted Supabase project.

1. **Create groomer** — sign up password-first as a groomer; complete the wizard (salon address, 2 services with durations/prices, Tue–Sat 9–5 with a lunch gap, lead time 2h, `accepts_waitlist` on, connect GBP mock). Land on a populated dashboard.
2. **Create customer** — in a second browser/profile, sign up password-first; add a dog.
3. **Book** — discover the groomer (real prices + availability badge), pick a service, choose a real slot, submit the request. Watch the request **pop into the groomer dashboard live** (Realtime).
4. **Accept** — groomer Accepts → customer gets a `booking_confirmed` notification; the slot disappears from availability.
5. **Cancel → waitlist** — as a second customer, join the groomer's waitlist for the same service. Then cancel the first appointment → the second customer receives a **"Claim by HH:MM"** offer → Claim → atomic new appointment.
6. **(Optional) Deposit** — toggle `requires_deposit`, re-run an Accept to show the mock Stripe deposit succeeding.

---

## 19. Environment & setup

- **Run:** `npm install` then `npm run dev` (Vite serves the app + mirrors `/api/*` via dev plugins). **npm only — do not use pnpm/yarn** (repo uses `package-lock.json`).
- **Database:** apply migrations to the **hosted** Supabase project (requires its DB credentials): `supabase link --project-ref <ref>` then `supabase db push`, or run the migration SQL in the dashboard SQL editor. Enable `btree_gist` (needed by the exclusion constraint).
- **Env vars** (existing `.env` + Netlify): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (public); `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_PLACES_API_KEY` (server). No new secrets required (Stripe/Square/GBP are mocked).
- **Feature flag:** `ENABLE_GROOMER_DASHBOARD=true` locally to exercise the groomer surface.

---

## 20. Out of scope / deferred

- Real Square Booking and Stripe API calls (interfaces + fakes only).
- Real GBP OAuth (mock connect only).
- Scheduled offer-expiry sweep / background workers (claim-time expiry check suffices for demo).
- Real SMS/push via Twilio/OneSignal (in-app notifications instead).
- Multi-timezone groomers beyond `groomers.timezone` (single tz per groomer; no per-customer tz conversion UI).
- Admin approval of *self-created* groomers (auto-verified); claiming pre-existing public listings keeps the existing admin flow.
- Playwright E2E (post-demo follow-up).
- Repo-wide `paw-status` → `shinypawz` rename (cosmetic; later).

---

## 21. Risks & open considerations

- **Timezone correctness** is the highest-bug-risk area — mitigated by centralizing tz math in `slots.js` with explicit DST tests.
- **Hosted-DB credential access** is a hard prerequisite for the chosen environment; if unavailable, fall back to local Supabase (CLI) with the same migrations.
- **GIST exclusion requires `btree_gist`** — confirm the extension is enabled before Phase 1.
- **`groomers.services` jsonb vs `groomer_service_offerings`** must be kept in sync by onboarding to avoid `nearby_groomers` filter drift — single write path in `groomerOnboarding.saveOffering`.
- **Realtime** depends on Supabase Realtime being enabled for the `notifications` table — enable replication in the dashboard.

---

## 22. Appendix — enums & constants

- `groomers.location_mode`: `salon` | `mobile`
- `waitlist_entries.status`: `active` | `offered` | `fulfilled` | `cancelled` | `expired`
- `waitlist_offers.status`: `pending` | `claimed` | `declined` | `expired`
- `payment_intents.status`: `requires_payment` | `succeeded` | `failed` | `refunded`; `kind`: `deposit` | `full`
- `groomer_integrations.provider`: `google_business_profile` | `square` | `stripe`; `status`: `not_connected` | `connected` | `error`
- `notifications.kind`: `booking_requested` | `booking_confirmed` | `booking_declined` | `waitlist_offer` | `waitlist_claimed` | `appointment_cancelled`
- Constants: `HORIZON_DAYS = 30`, `NEXT_AVAIL_HORIZON_DAYS = 14`, `OFFER_TTL_MINUTES = 60`, default `booking_lead_time_hours = 2`
