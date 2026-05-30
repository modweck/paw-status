# ShinyPawz Phase 1 — Foundation (Availability Engine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the timezone-correct, slot-based availability foundation — the engine, schema, and HTTP endpoint that every later phase (booking, waitlist) depends on.

**Architecture:** A pure, dependency-free JS slot engine (`apps/api/src/booking/`) computes bookable slots from a groomer's recurring weekly hours minus time-off and existing bookings. A server helper (`apps/web/server/availability.js`) loads the inputs from Supabase with the service-role key (so it can read private time-off) and calls the engine. Thin Netlify-function + Vite-dev-plugin adapters expose it at `/api/availability`. Three Supabase migrations add the supporting columns/tables and a GIST exclusion constraint for double-booking safety.

**Tech Stack:** Node ESM, Vitest + Testing Library, `@supabase/supabase-js`, Supabase Postgres + PostGIS + `btree_gist`, Netlify Functions, Vite dev middleware. **npm only** (repo uses `package-lock.json` — never pnpm/yarn).

**Spec:** `docs/superpowers/specs/2026-05-29-shinypawz-demo-ready-design.md` (§4.2, §5.1–5.4, §6, §8, §9, §17 Phase 1).

---

## File Structure (locked decomposition)

| File | Responsibility |
|---|---|
| `apps/api/src/booking/constants.js` | Shared numeric constants (horizon, lead time). |
| `apps/api/src/booking/timezone.js` | Dependency-free tz helpers: wall-clock↔UTC, local date string. |
| `apps/api/src/booking/timezone.test.js` | DST + offset unit tests. |
| `apps/api/src/booking/slots.js` | Pure `generateSlots()` engine. |
| `apps/api/src/booking/slots.test.js` | Engine edge-case unit tests. |
| `apps/web/server/availability.js` | Loads inputs from Supabase (service-role) + calls `generateSlots`; `toPublicAvailabilityError`. |
| `apps/web/server/availability.test.js` | Tests the loader with a mock Supabase client. |
| `apps/web/netlify/functions/availability.js` | Thin GET adapter (prod). |
| `apps/web/vite.config.js` | Add `availabilityDevPlugin` (dev mirror). |
| `netlify.toml` | Add `/api/availability` redirect. |
| `apps/web/src/api/availability.js` | Client fetch wrapper + row mapping. |
| `apps/web/src/api/availability.test.js` | Client wrapper tests (mock fetch). |
| `supabase/migrations/*_add_groomer_location_and_booking_config.sql` | `groomers` columns + `btree_gist`. |
| `supabase/migrations/*_add_groomer_offerings_and_availability.sql` | offerings + availability + time-off + RLS. |
| `supabase/migrations/*_promote_appointments_to_real_bookings.sql` | `appointments` columns + GIST + RLS; request slot columns. |

---

## Task 1: Booking constants

**Files:**
- Create: `apps/api/src/booking/constants.js`

- [ ] **Step 1: Create the constants module**

```js
// apps/api/src/booking/constants.js
export const HORIZON_DAYS = 30;
export const NEXT_AVAIL_HORIZON_DAYS = 14;
export const OFFER_TTL_MINUTES = 60;
export const DEFAULT_LEAD_TIME_HOURS = 2;
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/booking/constants.js
git commit -m "feat(booking): add scheduling constants"
```

---

## Task 2: Timezone helpers (dependency-free)

**Files:**
- Create: `apps/api/src/booking/timezone.js`
- Test: `apps/api/src/booking/timezone.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// apps/api/src/booking/timezone.test.js
import { describe, it, expect } from 'vitest';
import { wallClockToUtcIso, localDateString } from './timezone.js';

describe('wallClockToUtcIso', () => {
  it('converts a winter (EST, UTC-5) wall time to UTC', () => {
    // 2026-01-15 09:00 in New York = 14:00 UTC
    expect(wallClockToUtcIso('2026-01-15', '09:00', 'America/New_York'))
      .toBe('2026-01-15T14:00:00.000Z');
  });

  it('converts a summer (EDT, UTC-4) wall time to UTC', () => {
    // 2026-07-15 09:00 in New York = 13:00 UTC
    expect(wallClockToUtcIso('2026-07-15', '09:00', 'America/New_York'))
      .toBe('2026-07-15T13:00:00.000Z');
  });

  it('handles a different timezone (America/Los_Angeles, UTC-8 winter)', () => {
    expect(wallClockToUtcIso('2026-01-15', '09:00', 'America/Los_Angeles'))
      .toBe('2026-01-15T17:00:00.000Z');
  });
});

describe('localDateString', () => {
  it('returns the local calendar date for an instant in the target tz', () => {
    // 04:30 UTC on Jan 15 is still 23:30 on Jan 14 in New York (EST)
    expect(localDateString(new Date('2026-01-15T04:30:00.000Z'), 'America/New_York'))
      .toBe('2026-01-14');
  });

  it('returns yyyy-MM-dd format', () => {
    expect(localDateString(new Date('2026-07-15T12:00:00.000Z'), 'America/New_York'))
      .toBe('2026-07-15');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace @paw-status/web -- timezone`
Expected: FAIL — `wallClockToUtcIso is not a function` / module not found.

- [ ] **Step 3: Write the implementation**

```js
// apps/api/src/booking/timezone.js

// Offset (ms) of `timeZone` from UTC at the given instant.
// Uses the Intl "format the instant as wall-clock parts, re-interpret as UTC" trick.
function tzOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(date).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  // Intl can emit hour '24' at midnight; normalise to 0.
  const hour = parts.hour === '24' ? 0 : Number(parts.hour);
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    hour, Number(parts.minute), Number(parts.second),
  );
  return asUtc - date.getTime();
}

/**
 * Convert a wall-clock date + time in `timeZone` to a UTC ISO string.
 * @param {string} dateStr 'yyyy-MM-dd'
 * @param {string} timeStr 'HH:MM'
 * @param {string} timeZone IANA tz id
 * @returns {string} ISO 8601 UTC
 */
export function wallClockToUtcIso(dateStr, timeStr, timeZone) {
  const naiveUtc = new Date(`${dateStr}T${timeStr}:00.000Z`);
  const offset = tzOffsetMs(naiveUtc, timeZone);
  return new Date(naiveUtc.getTime() - offset).toISOString();
}

/**
 * The local calendar date ('yyyy-MM-dd') of an instant in `timeZone`.
 * @param {Date} date
 * @param {string} timeZone
 * @returns {string}
 */
export function localDateString(date, timeZone) {
  // 'en-CA' formats as yyyy-MM-dd.
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = dtf.formatToParts(date).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace @paw-status/web -- timezone`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/booking/timezone.js apps/api/src/booking/timezone.test.js
git commit -m "feat(booking): add dependency-free timezone helpers"
```

---

## Task 3: The slot engine

**Files:**
- Create: `apps/api/src/booking/slots.js`
- Test: `apps/api/src/booking/slots.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// apps/api/src/booking/slots.test.js
import { describe, it, expect } from 'vitest';
import { generateSlots } from './slots.js';

const TZ = 'America/New_York';
// Fixed "now": 2026-06-01 12:00 UTC (08:00 EDT, a Monday).
const NOW = '2026-06-01T12:00:00.000Z';

function baseInput(overrides = {}) {
  return {
    fromIso: '2026-06-02T00:00:00.000Z', // Tuesday
    toIso: '2026-06-03T00:00:00.000Z',
    timezone: TZ,
    durationMinutes: 60,
    leadTimeHours: 2,
    availability: [{ weekday: 2, startTime: '09:00', endTime: '12:00' }], // Tuesday 9–12
    timeOff: [],
    busy: [],
    nowIso: NOW,
    ...overrides,
  };
}

describe('generateSlots', () => {
  it('generates back-to-back slots within a weekday block', () => {
    const slots = generateSlots(baseInput());
    // 9:00, 10:00, 11:00 EDT on Tue Jun 2 -> 13:00, 14:00, 15:00 UTC
    expect(slots.map((s) => s.slotAt)).toEqual([
      '2026-06-02T13:00:00.000Z',
      '2026-06-02T14:00:00.000Z',
      '2026-06-02T15:00:00.000Z',
    ]);
    expect(slots.every((s) => s.durationMinutes === 60)).toBe(true);
  });

  it('does not emit a slot that would run past the block end', () => {
    const slots = generateSlots(baseInput({ durationMinutes: 90 }));
    // 9:00 and 10:30 fit (end 12:00); 12:00 would overrun -> only two
    expect(slots).toHaveLength(2);
  });

  it('models a lunch break with two blocks on the same weekday', () => {
    const slots = generateSlots(baseInput({
      availability: [
        { weekday: 2, startTime: '09:00', endTime: '11:00' },
        { weekday: 2, startTime: '13:00', endTime: '15:00' },
      ],
    }));
    // 9,10 (morning) + 13,14 (afternoon) EDT
    expect(slots.map((s) => s.slotAt)).toEqual([
      '2026-06-02T13:00:00.000Z',
      '2026-06-02T14:00:00.000Z',
      '2026-06-02T17:00:00.000Z',
      '2026-06-02T18:00:00.000Z',
    ]);
  });

  it('excludes slots overlapping a time-off block', () => {
    const slots = generateSlots(baseInput({
      timeOff: [{ startsAt: '2026-06-02T13:30:00.000Z', endsAt: '2026-06-02T14:30:00.000Z' }],
    }));
    // 13:00 overlaps (13:00–14:00 ∩ 13:30–14:30), 14:00 overlaps, 15:00 clear
    expect(slots.map((s) => s.slotAt)).toEqual(['2026-06-02T15:00:00.000Z']);
  });

  it('excludes slots overlapping an existing busy appointment', () => {
    const slots = generateSlots(baseInput({
      busy: [{ scheduledAt: '2026-06-02T14:00:00.000Z', durationMinutes: 60 }],
    }));
    expect(slots.map((s) => s.slotAt)).toEqual([
      '2026-06-02T13:00:00.000Z',
      '2026-06-02T15:00:00.000Z',
    ]);
  });

  it('respects the lead-time cutoff', () => {
    // now = 2026-06-02T12:00Z, lead 2h -> earliest 14:00Z; the 13:00Z slot is dropped
    const slots = generateSlots(baseInput({
      fromIso: '2026-06-02T00:00:00.000Z',
      nowIso: '2026-06-02T12:00:00.000Z',
    }));
    expect(slots.map((s) => s.slotAt)).toEqual([
      '2026-06-02T14:00:00.000Z',
      '2026-06-02T15:00:00.000Z',
    ]);
  });

  it('honors DST: winter slots are an hour later in UTC than summer', () => {
    const winter = generateSlots(baseInput({
      fromIso: '2026-01-06T00:00:00.000Z', // Tuesday Jan 6 (EST)
      toIso: '2026-01-07T00:00:00.000Z',
      nowIso: '2026-01-01T00:00:00.000Z',
    }));
    // 9:00 EST = 14:00 UTC (vs 13:00 in EDT)
    expect(winter[0].slotAt).toBe('2026-01-06T14:00:00.000Z');
  });

  it('returns empty for zero/negative duration', () => {
    expect(generateSlots(baseInput({ durationMinutes: 0 }))).toEqual([]);
  });

  it('returns empty when the window is inverted', () => {
    expect(generateSlots(baseInput({
      fromIso: '2026-06-03T00:00:00.000Z',
      toIso: '2026-06-02T00:00:00.000Z',
    }))).toEqual([]);
  });

  it('returns sorted ascending slots across multiple days', () => {
    const slots = generateSlots(baseInput({
      fromIso: '2026-06-02T00:00:00.000Z',
      toIso: '2026-06-10T00:00:00.000Z',
      availability: [{ weekday: 2, startTime: '09:00', endTime: '10:00' }], // Tuesdays only
    }));
    // Tue Jun 2 09:00 and Tue Jun 9 09:00
    expect(slots.map((s) => s.slotAt)).toEqual([
      '2026-06-02T13:00:00.000Z',
      '2026-06-09T13:00:00.000Z',
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace @paw-status/web -- slots`
Expected: FAIL — `generateSlots is not a function`.

- [ ] **Step 3: Write the implementation**

```js
// apps/api/src/booking/slots.js
import { HORIZON_DAYS } from './constants.js';
import { wallClockToUtcIso, localDateString } from './timezone.js';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function timeToMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function addMinutesToTime(time, minutes) {
  const total = timeToMinutes(time) + minutes;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function addLocalDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(dateStr) {
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay(); // 0=Sun..6=Sat
}

/**
 * Generate bookable slots for ONE groomer + ONE service.
 * Pure and deterministic — `nowIso` is injected (never Date.now()).
 *
 * @param {{
 *   fromIso: string, toIso: string, timezone: string,
 *   durationMinutes: number, leadTimeHours: number,
 *   availability?: Array<{ weekday: number, startTime: string, endTime: string }>,
 *   timeOff?: Array<{ startsAt: string, endsAt: string }>,
 *   busy?: Array<{ scheduledAt: string, durationMinutes: number }>,
 *   nowIso: string,
 * }} input
 * @returns {Array<{ slotAt: string, durationMinutes: number }>} ascending
 */
export function generateSlots({
  fromIso, toIso, timezone, durationMinutes, leadTimeHours,
  availability = [], timeOff = [], busy = [], nowIso,
}) {
  if (!durationMinutes || durationMinutes <= 0) return [];

  const nowMs = new Date(nowIso).getTime();
  const earliestMs = nowMs + (leadTimeHours || 0) * 60 * MINUTE_MS;
  const horizonEndMs = nowMs + HORIZON_DAYS * DAY_MS;

  const windowStartMs = Math.max(new Date(fromIso).getTime(), earliestMs);
  const windowEndMs = Math.min(new Date(toIso).getTime(), horizonEndMs);
  if (windowEndMs <= windowStartMs) return [];

  const timeOffRanges = timeOff.map((t) => [
    new Date(t.startsAt).getTime(), new Date(t.endsAt).getTime(),
  ]);
  const busyRanges = busy.map((b) => {
    const start = new Date(b.scheduledAt).getTime();
    return [start, start + b.durationMinutes * MINUTE_MS];
  });

  const startDate = localDateString(new Date(windowStartMs), timezone);
  const endDate = localDateString(new Date(windowEndMs), timezone);

  const slots = [];
  for (let date = startDate; date <= endDate; date = addLocalDays(date, 1)) {
    const weekday = weekdayOf(date);
    for (const block of availability.filter((b) => b.weekday === weekday)) {
      const blockEndMin = timeToMinutes(block.endTime);
      let t = block.startTime;
      while (timeToMinutes(t) + durationMinutes <= blockEndMin) {
        const slotIso = wallClockToUtcIso(date, t, timezone);
        const slotStartMs = new Date(slotIso).getTime();
        const slotEndMs = slotStartMs + durationMinutes * MINUTE_MS;
        t = addMinutesToTime(t, durationMinutes);

        if (slotStartMs < windowStartMs || slotStartMs >= windowEndMs) continue;
        if (timeOffRanges.some(([s, e]) => rangesOverlap(slotStartMs, slotEndMs, s, e))) continue;
        if (busyRanges.some(([s, e]) => rangesOverlap(slotStartMs, slotEndMs, s, e))) continue;

        slots.push({ slotAt: slotIso, durationMinutes });
      }
    }
  }
  slots.sort((a, b) => a.slotAt.localeCompare(b.slotAt));
  return slots;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace @paw-status/web -- slots`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/booking/slots.js apps/api/src/booking/slots.test.js
git commit -m "feat(booking): add timezone-correct slot generation engine"
```

---

## Task 4: Migration — groomer location & booking config

**Files:**
- Create: `supabase/migrations/<timestamp>_add_groomer_location_and_booking_config.sql`

> Use the repo's timestamp convention (e.g. `20260530000001_...`). Apply with `supabase db push` against the linked project, or paste into the dashboard SQL editor. **Requires the hosted project's DB credentials.**

- [ ] **Step 1: Write the migration**

```sql
-- Enable btree_gist for the appointments exclusion constraint added in a later migration.
create extension if not exists btree_gist;

alter table public.groomers
  add column if not exists location_mode text not null default 'salon'
    check (location_mode in ('salon','mobile')),
  add column if not exists service_radius_meters integer,
  add column if not exists owner_account_id uuid references public.groomer_accounts(id),
  add column if not exists accepts_waitlist boolean not null default false,
  add column if not exists booking_lead_time_hours integer not null default 2,
  add column if not exists requires_deposit boolean not null default false,
  add column if not exists timezone text not null default 'America/New_York',
  add column if not exists bio text;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push` (or paste into the dashboard SQL editor).
Expected: success; no errors.

- [ ] **Step 3: Verify the columns exist**

Run this query (SQL editor or `psql`):

```sql
select column_name from information_schema.columns
where table_name = 'groomers'
  and column_name in ('location_mode','service_radius_meters','owner_account_id',
                      'accepts_waitlist','booking_lead_time_hours','requires_deposit',
                      'timezone','bio')
order by column_name;
```

Expected: 8 rows returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/*_add_groomer_location_and_booking_config.sql
git commit -m "feat(db): add groomer location mode and booking config columns"
```

---

## Task 5: Migration — offerings, availability, time-off

**Files:**
- Create: `supabase/migrations/<timestamp>_add_groomer_offerings_and_availability.sql`

- [ ] **Step 1: Write the migration**

```sql
create table if not exists public.groomer_service_offerings (
  id uuid primary key default gen_random_uuid(),
  groomer_id uuid not null references public.groomers(id) on delete cascade,
  service_id text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  price_cents integer not null check (price_cents >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (groomer_id, service_id)
);

create table if not exists public.groomer_availability (
  id uuid primary key default gen_random_uuid(),
  groomer_id uuid not null references public.groomers(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists groomer_availability_groomer_weekday_idx
  on public.groomer_availability (groomer_id, weekday);

create table if not exists public.groomer_time_off (
  id uuid primary key default gen_random_uuid(),
  groomer_id uuid not null references public.groomers(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists groomer_time_off_groomer_starts_idx
  on public.groomer_time_off (groomer_id, starts_at);

-- RLS
alter table public.groomer_service_offerings enable row level security;
alter table public.groomer_availability enable row level security;
alter table public.groomer_time_off enable row level security;

-- Offerings & availability: PUBLIC read (customer UI shows hours/prices).
create policy "offerings are public" on public.groomer_service_offerings
  for select using (true);
create policy "availability is public" on public.groomer_availability
  for select using (true);

-- Writes restricted to a verified groomer for that groomer_id (existing helper).
create policy "verified groomer manages offerings" on public.groomer_service_offerings
  for all
  using (app_private.current_user_verified_for_groomer(groomer_id))
  with check (app_private.current_user_verified_for_groomer(groomer_id));
create policy "verified groomer manages availability" on public.groomer_availability
  for all
  using (app_private.current_user_verified_for_groomer(groomer_id))
  with check (app_private.current_user_verified_for_groomer(groomer_id));

-- Time-off is PRIVATE: only the verified groomer can read/write it.
create policy "verified groomer manages time off" on public.groomer_time_off
  for all
  using (app_private.current_user_verified_for_groomer(groomer_id))
  with check (app_private.current_user_verified_for_groomer(groomer_id));
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: success.

- [ ] **Step 3: Verify tables + RLS**

```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public'
  and tablename in ('groomer_service_offerings','groomer_availability','groomer_time_off');
```

Expected: 3 rows, all `rowsecurity = true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/*_add_groomer_offerings_and_availability.sql
git commit -m "feat(db): add groomer offerings, availability, and time-off tables with RLS"
```

---

## Task 6: Migration — promote appointments to real bookings

**Files:**
- Create: `supabase/migrations/<timestamp>_promote_appointments_to_real_bookings.sql`

- [ ] **Step 1: Write the migration**

```sql
alter table public.appointments
  add column if not exists appointment_request_id uuid references public.appointment_requests(id),
  add column if not exists customer_id uuid references public.customers(id),
  add column if not exists service_id text,
  add column if not exists duration_minutes integer not null default 60,
  add column if not exists price_cents integer;

-- Superseded legacy columns: service_id/price_cents are now canonical. Drop NOT NULL
-- so RPC inserts that omit the legacy columns (e.g. Phase 4 claim_waitlist_offer) succeed.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'appointments' and column_name = 'service') then
    execute 'alter table public.appointments alter column service drop not null';
  end if;
  if exists (select 1 from information_schema.columns
             where table_name = 'appointments' and column_name = 'price') then
    execute 'alter table public.appointments alter column price drop not null';
  end if;
end $$;

-- Double-booking safety: no two ACTIVE appointments for one groomer may overlap in time.
alter table public.appointments
  drop constraint if exists appointments_no_overlap;
alter table public.appointments
  add constraint appointments_no_overlap
  exclude using gist (
    groomer_id with =,
    tstzrange(scheduled_at, scheduled_at + (duration_minutes || ' minutes')::interval) with &&
  )
  where (status in ('booked','checked_in','bathing','drying','almost_ready','ready_for_pickup'));

-- Concrete chosen slot on requests (slot-based flow); preferred_windows stays for back-compat.
alter table public.appointment_requests
  add column if not exists requested_slot_at timestamptz,
  add column if not exists requested_duration_minutes integer,
  add column if not exists service_id text;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: success. (If it errors on `btree_gist`, confirm Task 4's `create extension` ran.)

- [ ] **Step 3: Verify the exclusion constraint exists**

```sql
select conname from pg_constraint
where conrelid = 'public.appointments'::regclass and conname = 'appointments_no_overlap';
```

Expected: 1 row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/*_promote_appointments_to_real_bookings.sql
git commit -m "feat(db): promote appointments to real bookings with overlap exclusion"
```

---

## CHECKPOINT A — engine + schema

Stop and review with the human (or reviewing agent):
- `npm test -- booking` is green (timezone + slots, ~15 tests).
- All three migrations applied cleanly to the linked project; verification queries returned expected rows.
- The GIST exclusion constraint is present.

Do not proceed to the endpoint until these hold.

---

## Task 7: Server availability loader

**Files:**
- Create: `apps/web/server/availability.js`
- Test: `apps/web/server/availability.test.js`

> Mirrors the existing `apps/web/server/googlePlaces.js` shape: a pure-ish function that takes a Supabase client + params, plus a `toPublic*Error` masker. It reads **private** `groomer_time_off`, so it must run with the service-role client (provided by the caller).

- [ ] **Step 1: Write the failing test**

```js
// apps/web/server/availability.test.js
import { describe, it, expect, vi } from 'vitest';
import { loadAvailableSlots, AvailabilityError } from './availability.js';

// Minimal mock of the supabase query builder used by loadAvailableSlots.
function mockSupabase(tables) {
  return {
    from(table) {
      const rows = tables[table] ?? [];
      const builder = {
        _rows: rows,
        select() { return builder; },
        eq() { return builder; },
        gte() { return builder; },
        lte() { return builder; },
        maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
        then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
      };
      return builder;
    },
  };
}

const NOW = '2026-06-01T12:00:00.000Z';

it('throws AvailabilityError when the service is not offered', async () => {
  const supabase = mockSupabase({
    groomers: [{ id: 'g1', timezone: 'America/New_York', booking_lead_time_hours: 2 }],
    groomer_service_offerings: [], // no offering
  });
  await expect(
    loadAvailableSlots(supabase, {
      groomerId: 'g1', serviceId: 'full-groom',
      fromIso: '2026-06-02T00:00:00.000Z', toIso: '2026-06-03T00:00:00.000Z', nowIso: NOW,
    }),
  ).rejects.toBeInstanceOf(AvailabilityError);
});

it('returns engine slots for an offered service', async () => {
  const supabase = mockSupabase({
    groomers: [{ id: 'g1', timezone: 'America/New_York', booking_lead_time_hours: 2 }],
    groomer_service_offerings: [{ groomer_id: 'g1', service_id: 'full-groom', duration_minutes: 60 }],
    groomer_availability: [{ groomer_id: 'g1', weekday: 2, start_time: '09:00:00', end_time: '11:00:00' }],
    groomer_time_off: [],
    appointments: [],
  });
  const slots = await loadAvailableSlots(supabase, {
    groomerId: 'g1', serviceId: 'full-groom',
    fromIso: '2026-06-02T00:00:00.000Z', toIso: '2026-06-03T00:00:00.000Z', nowIso: NOW,
  });
  expect(slots).toEqual([
    { slotAt: '2026-06-02T13:00:00.000Z', durationMinutes: 60 },
    { slotAt: '2026-06-02T14:00:00.000Z', durationMinutes: 60 },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @paw-status/web -- server/availability`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// apps/web/server/availability.js
import { generateSlots } from '../../api/src/booking/slots.js';
import { DEFAULT_LEAD_TIME_HOURS } from '../../api/src/booking/constants.js';

export class AvailabilityError extends Error {
  constructor(message, { statusCode = 400, code = 'availability_error' } = {}) {
    super(message);
    this.name = 'AvailabilityError';
    this.statusCode = statusCode;
    this.code = code;
    this.publicMessage = message;
  }
}

// 'HH:MM:SS' or 'HH:MM' -> 'HH:MM'
function trimTime(t) {
  return String(t).slice(0, 5);
}

/**
 * Load a groomer's bookable slots for a service over [fromIso, toIso].
 * Reads private time-off, so `supabase` MUST be a service-role client.
 */
export async function loadAvailableSlots(supabase, { groomerId, serviceId, fromIso, toIso, nowIso }) {
  if (!groomerId || !serviceId) {
    throw new AvailabilityError('groomerId and serviceId are required.');
  }

  const { data: groomer, error: groomerErr } = await supabase
    .from('groomers').select('id, timezone, booking_lead_time_hours').eq('id', groomerId).maybeSingle();
  if (groomerErr) throw new AvailabilityError('Could not load groomer.', { statusCode: 502 });
  if (!groomer) throw new AvailabilityError('Groomer not found.', { statusCode: 404, code: 'not_found' });

  const { data: offerings } = await supabase
    .from('groomer_service_offerings')
    .select('service_id, duration_minutes, is_active')
    .eq('groomer_id', groomerId).eq('service_id', serviceId);
  const offering = (offerings ?? []).find((o) => o.is_active !== false);
  if (!offering) {
    throw new AvailabilityError('This groomer does not offer that service.', {
      statusCode: 404, code: 'service_not_offered',
    });
  }

  const { data: availability } = await supabase
    .from('groomer_availability')
    .select('weekday, start_time, end_time').eq('groomer_id', groomerId);

  const { data: timeOff } = await supabase
    .from('groomer_time_off')
    .select('starts_at, ends_at').eq('groomer_id', groomerId);

  const { data: busy } = await supabase
    .from('appointments')
    .select('scheduled_at, duration_minutes, status').eq('groomer_id', groomerId)
    .gte('scheduled_at', fromIso).lte('scheduled_at', toIso);

  const activeStatuses = new Set([
    'booked', 'checked_in', 'bathing', 'drying', 'almost_ready', 'ready_for_pickup',
  ]);

  return generateSlots({
    fromIso, toIso,
    timezone: groomer.timezone || 'America/New_York',
    durationMinutes: offering.duration_minutes,
    leadTimeHours: groomer.booking_lead_time_hours ?? DEFAULT_LEAD_TIME_HOURS,
    availability: (availability ?? []).map((a) => ({
      weekday: a.weekday, startTime: trimTime(a.start_time), endTime: trimTime(a.end_time),
    })),
    timeOff: (timeOff ?? []).map((t) => ({ startsAt: t.starts_at, endsAt: t.ends_at })),
    busy: (busy ?? [])
      .filter((b) => activeStatuses.has(b.status))
      .map((b) => ({ scheduledAt: b.scheduled_at, durationMinutes: b.duration_minutes })),
    nowIso: nowIso || new Date().toISOString(),
  });
}

export function toPublicAvailabilityError(error) {
  if (error instanceof AvailabilityError) {
    return { statusCode: error.statusCode, body: { error: error.publicMessage, code: error.code } };
  }
  return { statusCode: 500, body: { error: 'Availability request failed.', code: 'internal_error' } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @paw-status/web -- server/availability`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/server/availability.js apps/web/server/availability.test.js
git commit -m "feat(server): add availability loader over the slot engine"
```

---

## Task 8: Netlify function adapter

**Files:**
- Create: `apps/web/netlify/functions/availability.js`

> Follow the existing function shape (see `apps/web/netlify/functions/places-details.js`). It needs a service-role Supabase client; reuse the existing helper used by guest-booking (`createServerSupabaseClient` in `apps/web/server/guestBooking.js`) — import it.

- [ ] **Step 1: Write the function**

```js
// apps/web/netlify/functions/availability.js
import { createServerSupabaseClient } from '../../server/guestBooking.js';
import { loadAvailableSlots, toPublicAvailabilityError } from '../../server/availability.js';

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }
  const params = event.queryStringParameters || {};
  try {
    const supabase = createServerSupabaseClient(process.env);
    const slots = await loadAvailableSlots(supabase, {
      groomerId: params.groomerId,
      serviceId: params.serviceId,
      fromIso: params.from,
      toIso: params.to,
      nowIso: new Date().toISOString(),
    });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ slots }),
    };
  } catch (error) {
    const publicError = toPublicAvailabilityError(error);
    return {
      statusCode: publicError.statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(publicError.body),
    };
  }
}
```

- [ ] **Step 2: Verify it parses**

Run: `node --check apps/web/netlify/functions/availability.js`
Expected: no output (exit 0).

> **Before writing this file:** confirm `createServerSupabaseClient` is exported from `apps/web/server/guestBooking.js`. The deep-dive confirmed a service-role client factory lives there (around lines 173–187); if its declaration lacks the `export` keyword, add `export` to it and stage that one-line change with this task. Both this function and the Vite dev plugin (Task 9) import it.

- [ ] **Step 3: Commit**

```bash
git add apps/web/netlify/functions/availability.js
git commit -m "feat(netlify): add availability function adapter"
```

---

## Task 9: Vite dev plugin mirror + redirect

**Files:**
- Modify: `apps/web/vite.config.js` (add a dev plugin alongside the existing ones, register it in the `plugins` array)
- Modify: `netlify.toml` (add a redirect)

- [ ] **Step 1: Add the dev plugin function to `vite.config.js`**

Add this function near the other `*DevPlugin` definitions:

```js
function availabilityDevPlugin(env) {
  return {
    name: 'paw-status-availability-dev',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = request.url || '';
        if (!url.startsWith('/api/availability')) {
          next();
          return;
        }
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Type', 'application/json');
        if (request.method !== 'GET') {
          response.statusCode = 405;
          response.end(JSON.stringify({ error: 'Method Not Allowed' }));
          return;
        }
        const requestUrl = new URL(url, 'http://localhost');
        try {
          const { createServerSupabaseClient } = await import('./server/guestBooking.js');
          const { loadAvailableSlots, toPublicAvailabilityError } = await import('./server/availability.js');
          const supabase = createServerSupabaseClient(env);
          const slots = await loadAvailableSlots(supabase, {
            groomerId: requestUrl.searchParams.get('groomerId'),
            serviceId: requestUrl.searchParams.get('serviceId'),
            fromIso: requestUrl.searchParams.get('from'),
            toIso: requestUrl.searchParams.get('to'),
            nowIso: new Date().toISOString(),
          });
          response.statusCode = 200;
          response.end(JSON.stringify({ slots }));
        } catch (error) {
          const { toPublicAvailabilityError } = await import('./server/availability.js');
          const publicError = toPublicAvailabilityError(error);
          response.statusCode = publicError.statusCode;
          response.end(JSON.stringify(publicError.body));
        }
      });
    },
  };
}
```

- [ ] **Step 2: Register the plugin**

In the `plugins: [...]` array (inside the returned config), add `availabilityDevPlugin(env)` alongside the existing dev plugins:

```js
    plugins: [
      react(),
      groomerPhotoDevPlugin(env),
      guestBookingDevPlugin(env),
      adminGroomerClaimsDevPlugin(env),
      googlePlacesDevPlugin(env),
      availabilityDevPlugin(env),
    ],
```

- [ ] **Step 3: Add the Netlify redirect to `netlify.toml`**

Add this block alongside the other `[[redirects]]` (before the SPA catch-all `/*` block):

```toml
[[redirects]]
  from = "/api/availability"
  to = "/.netlify/functions/availability"
  status = 200
```

- [ ] **Step 4: Verify the dev server boots and the route responds**

Run: `npm run dev` (in one terminal), then in another:

```bash
curl -s "http://localhost:5173/api/availability?groomerId=00000000-0000-0000-0000-000000000000&serviceId=full-groom&from=2026-06-02T00:00:00Z&to=2026-06-03T00:00:00Z"
```

Expected: a JSON body — either `{"slots":[...]}` for a real groomer, or `{"error":"Groomer not found.","code":"not_found"}` for the placeholder id. (A JSON error is success here: it proves the route is wired and reaching the loader.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/vite.config.js netlify.toml
git commit -m "feat(dev): mirror /api/availability in vite dev + netlify redirect"
```

---

## Task 10: Client availability API module

**Files:**
- Create: `apps/web/src/api/availability.js`
- Test: `apps/web/src/api/availability.test.js`

> Follow the existing `apps/web/src/api/*` idiom: a thin fetch wrapper that throws `Error(message)` on failure and returns mapped data.

- [ ] **Step 1: Write the failing test**

```js
// apps/web/src/api/availability.test.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchAvailableSlots } from './availability.js';

afterEach(() => vi.restoreAllMocks());

it('requests the endpoint with the right query and returns slots', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ slots: [{ slotAt: '2026-06-02T13:00:00.000Z', durationMinutes: 60 }] }),
  });
  vi.stubGlobal('fetch', fetchMock);

  const slots = await fetchAvailableSlots({
    groomerId: 'g1', serviceId: 'full-groom',
    from: '2026-06-02T00:00:00.000Z', to: '2026-06-03T00:00:00.000Z',
  });

  expect(slots).toEqual([{ slotAt: '2026-06-02T13:00:00.000Z', durationMinutes: 60 }]);
  const calledUrl = fetchMock.mock.calls[0][0];
  expect(calledUrl).toContain('/api/availability?');
  expect(calledUrl).toContain('groomerId=g1');
  expect(calledUrl).toContain('serviceId=full-groom');
});

it('throws the server error message on a non-ok response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    json: async () => ({ error: 'This groomer does not offer that service.' }),
  }));
  await expect(fetchAvailableSlots({
    groomerId: 'g1', serviceId: 'nope', from: 'a', to: 'b',
  })).rejects.toThrow('This groomer does not offer that service.');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @paw-status/web -- src/api/availability`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// apps/web/src/api/availability.js

/**
 * Fetch a groomer's bookable slots for a service.
 * @returns {Promise<Array<{ slotAt: string, durationMinutes: number }>>}
 */
export async function fetchAvailableSlots({ groomerId, serviceId, from, to }) {
  const query = new URLSearchParams({ groomerId, serviceId, from, to }).toString();
  const response = await fetch(`/api/availability?${query}`);
  if (!response.ok) {
    let message = 'Could not load availability.';
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      // non-JSON error body; keep default message
    }
    throw new Error(message);
  }
  const body = await response.json();
  return Array.isArray(body.slots) ? body.slots : [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @paw-status/web -- src/api/availability`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/api/availability.js apps/web/src/api/availability.test.js
git commit -m "feat(api): add client availability fetch wrapper"
```

---

## CHECKPOINT B — Phase 1 complete

Verify the whole foundation:
- [ ] `npm test` is green (new: timezone, slots, server/availability, src/api/availability).
- [ ] `npm run build` succeeds.
- [ ] `node --check apps/web/netlify/functions/availability.js` passes.
- [ ] `git diff --check` is clean.
- [ ] Manual: with a seeded groomer that has an offering + availability, `curl /api/availability?...` returns real slots; vacation rows reduce them.

**Deliverable:** a working, tested availability subsystem. Phase 2 (groomer onboarding) and Phase 3 (booking) build directly on `fetchAvailableSlots` and the new tables.

---

## Notes for Plans 2–5 (not part of this plan)

- **Plan 2 (Onboarding):** `create_owned_groomer` RPC, `LoginPanel` groomer intent, `OnboardingWizard` + steps, `groomerOnboarding.js`. Writes offerings/availability that this engine consumes.
- **Plan 3 (Booking):** `confirm_appointment_request` + `cancel_appointment` RPCs, `SlotPicker` (consumes `fetchAvailableSlots`), `StaffDashboard` Requests tab, `notifications` + `NotificationBell` (Realtime).
- **Plan 4 (Waitlist):** waitlist tables, `claim_waitlist_offer`/`offer_waitlist_slot` RPCs, `/api/next-available` (reuses the engine), waitlist UI.
- **Plan 5 (Integrations):** `payment_intents`/`groomer_integrations`, mock `stripe.js`/`square.js`/GBP, `DepositModal`.
