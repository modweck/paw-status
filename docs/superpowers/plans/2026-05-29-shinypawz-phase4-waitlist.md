# ShinyPawz Phase 4 — Waitlist & Next-Available Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two waitlist entry points sharing one engine — a **global next-available** ranked search (book the soonest real opening near you) and a **per-groomer/global waitlist** with a sequential, time-limited offer/claim that auto-backfills freed slots on cancellation.

**Architecture:** A new `groomers_serving_point` RPC finds groomers who can serve a location for a service; a server loader ranks their earliest slots via the Phase 1 engine behind `/api/next-available`. Waitlist offers are created by a private helper `app_private.offer_to_next_waitlist_entry` (oldest matching active entry, sequential), invoked both by a groomer's manual `offer_waitlist_slot` RPC and by the `cancel_appointment` RPC (now `REPLACE`-d to backfill). Customers accept via the atomic `claim_waitlist_offer` RPC.

**Tech Stack:** Supabase Postgres (`SECURITY DEFINER` RPCs, PostGIS `st_dwithin`), the Phase 1 JS slot engine, React 18, Vitest. **npm only.**

**Depends on:** Phase 1 (engine + `/api/availability` pattern + GIST), Phase 3 (`cancel_appointment`, `app_private.notify`, notifications, `appointments`).

**Spec:** `docs/superpowers/specs/2026-05-29-shinypawz-demo-ready-design.md` (§5.2 waitlist tables, §7 `claim_waitlist_offer`/`offer_waitlist_slot`/`cancel_appointment` backfill, §10 Flow 4, §17 Phase 4).

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/*_add_waitlist.sql` | `waitlist_entries`, `waitlist_offers` + RLS, `offer_to_next_waitlist_entry`, `claim_waitlist_offer`, `offer_waitlist_slot`, `groomers_serving_point`, and the `cancel_appointment` backfill replacement. |
| `apps/web/server/nextAvailable.js` | Ranked cross-groomer slot loader (service-role). |
| `apps/web/server/nextAvailable.test.js` | Loader test (mock supabase). |
| `apps/web/netlify/functions/next-available.js` | Thin POST adapter. |
| `apps/web/vite.config.js` (modify) | `nextAvailableDevPlugin`. |
| `netlify.toml` (modify) | `/api/next-available` redirect. |
| `apps/web/src/api/waitlist.js` | `fetchNextAvailable`, `joinWaitlist`, `loadMyWaitlist`, `loadMyOffers`, `claimOffer`, `loadGroomerWaitlist`, `offerSlot`. |
| `apps/web/src/api/waitlist.test.js` | Tests. |
| `apps/web/src/customer/NextAvailablePanel.jsx` | Search soonest openings / join global waitlist. |
| `apps/web/src/customer/NextAvailablePanel.test.jsx` | Component test. |
| `apps/web/src/customer/WaitlistOffers.jsx` | Pending offers + Claim CTA. |
| `apps/web/src/customer/WaitlistOffers.test.jsx` | Component test. |
| `apps/web/src/groomer/WaitlistInbox.jsx` | Per-groomer entries + "offer a slot". |
| `apps/web/src/groomer/StaffDashboard.jsx` (modify) | Waitlist tab. |
| `apps/web/src/customer/BookingsListPanel.jsx` (modify) | Mount `WaitlistOffers`. |

---

## Task 1: Waitlist migration (tables, RPCs, cancel backfill)

**Files:**
- Create: `supabase/migrations/<timestamp>_add_waitlist.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 1. Tables --------------------------------------------------------------------
create table if not exists public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  dog_id uuid not null references public.dogs(id) on delete cascade,
  groomer_id uuid references public.groomers(id) on delete cascade,   -- NULL = global
  service_id text not null,
  search_lat double precision,
  search_lng double precision,
  max_distance_meters integer,
  desired_after timestamptz,
  desired_before timestamptz,
  status text not null default 'active'
    check (status in ('active','offered','fulfilled','cancelled','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists waitlist_entries_groomer_idx
  on public.waitlist_entries (groomer_id, status, created_at);
create index if not exists waitlist_entries_customer_idx
  on public.waitlist_entries (customer_id, status);

create table if not exists public.waitlist_offers (
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
create index if not exists waitlist_offers_entry_idx on public.waitlist_offers (waitlist_entry_id, status);
create index if not exists waitlist_offers_groomer_idx on public.waitlist_offers (groomer_id, status);

-- 2. RLS -----------------------------------------------------------------------
alter table public.waitlist_entries enable row level security;
alter table public.waitlist_offers enable row level security;

-- helper: the current user's customer ids
-- (inline subquery used in policies below)
create policy "customer manages own waitlist entries" on public.waitlist_entries
  for all
  using (customer_id in (select c.id from public.customers c where c.auth_user_id = (select auth.uid())))
  with check (customer_id in (select c.id from public.customers c where c.auth_user_id = (select auth.uid())));

create policy "verified groomer reads targeted waitlist entries" on public.waitlist_entries
  for select
  using (groomer_id is not null and app_private.current_user_verified_for_groomer(groomer_id));

create policy "customer reads offers for own entries" on public.waitlist_offers
  for select
  using (waitlist_entry_id in (
    select e.id from public.waitlist_entries e
    join public.customers c on c.id = e.customer_id
    where c.auth_user_id = (select auth.uid())
  ));

create policy "verified groomer reads own offers" on public.waitlist_offers
  for select
  using (app_private.current_user_verified_for_groomer(groomer_id));
-- No client INSERT/UPDATE on offers — only the SECURITY DEFINER RPCs write them.

-- 3. Find groomers serving a point for a service (next-available search) --------
create or replace function public.groomers_serving_point(
  p_lat double precision, p_lng double precision, p_radius_m integer, p_service_id text
) returns table (
  groomer_id uuid, name text, timezone text, booking_lead_time_hours integer,
  duration_minutes integer, price_cents integer, distance_meters double precision
)
language sql security definer set search_path = public, extensions as $$
  select g.id, g.name, g.timezone, g.booking_lead_time_hours,
         o.duration_minutes, o.price_cents,
         st_distance(g.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography)
  from public.groomers g
  join public.groomer_service_offerings o
    on o.groomer_id = g.id and o.service_id = p_service_id and o.is_active
  where g.location is not null
    and (
      (g.location_mode = 'salon'
        and st_dwithin(g.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_m))
      or (g.location_mode = 'mobile'
        and st_dwithin(g.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
                       coalesce(g.service_radius_meters, 0)))
    )
  order by 7
  limit 50;
$$;
grant execute on function public.groomers_serving_point(double precision, double precision, integer, text)
  to anon, authenticated;

-- 4. Offer to the next matching active entry (sequential) ----------------------
create or replace function app_private.offer_to_next_waitlist_entry(
  p_groomer_id uuid, p_service_id text, p_slot_at timestamptz, p_duration_minutes integer
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_groomer public.groomers;
  v_entry public.waitlist_entries;
  v_offer_id uuid;
  v_customer public.customers;
begin
  select * into v_groomer from public.groomers where id = p_groomer_id;

  select e.* into v_entry
  from public.waitlist_entries e
  where e.status = 'active'
    and e.service_id = p_service_id
    and (
      e.groomer_id = p_groomer_id
      or (e.groomer_id is null and e.search_lat is not null and e.search_lng is not null
          and v_groomer.location is not null
          and st_dwithin(v_groomer.location,
                         st_setsrid(st_makepoint(e.search_lng, e.search_lat), 4326)::geography,
                         coalesce(e.max_distance_meters, 0)))
    )
    and (e.desired_after is null or p_slot_at >= e.desired_after)
    and (e.desired_before is null or p_slot_at <= e.desired_before)
  order by e.created_at asc
  limit 1;

  if v_entry.id is null then return null; end if;

  insert into public.waitlist_offers (waitlist_entry_id, groomer_id, slot_at, duration_minutes, service_id, expires_at)
  values (v_entry.id, p_groomer_id, p_slot_at, p_duration_minutes, p_service_id,
          now() + interval '60 minutes')   -- OFFER_TTL_MINUTES
  returning id into v_offer_id;

  update public.waitlist_entries set status = 'offered', updated_at = now() where id = v_entry.id;

  select * into v_customer from public.customers where id = v_entry.customer_id;
  perform app_private.notify(v_customer.auth_user_id, 'waitlist_offer', 'A slot opened up!',
    'Claim it before it expires.',
    jsonb_build_object('offerId', v_offer_id, 'groomerId', p_groomer_id, 'slotAt', p_slot_at));

  return v_offer_id;
end; $$;

-- 5. Claim an offer (atomic) ---------------------------------------------------
create or replace function public.claim_waitlist_offer(p_offer_id uuid)
returns public.appointments
language plpgsql security definer set search_path = public, auth as $$
declare
  v_offer public.waitlist_offers;
  v_entry public.waitlist_entries;
  v_customer public.customers;
  v_owner uuid;
  v_appt public.appointments;
begin
  select * into v_offer from public.waitlist_offers where id = p_offer_id;
  if v_offer.id is null then raise exception 'Offer not found.' using errcode = 'P0002'; end if;
  select * into v_entry from public.waitlist_entries where id = v_offer.waitlist_entry_id;
  select * into v_customer from public.customers where id = v_entry.customer_id;

  if v_customer.auth_user_id <> (select auth.uid()) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  if v_offer.status <> 'pending' or now() >= v_offer.expires_at then
    raise exception 'This offer is no longer available.' using errcode = '22023';
  end if;

  begin
    insert into public.appointments (dog_id, groomer_id, customer_id, service_id, scheduled_at, duration_minutes, status)
    values (v_entry.dog_id, v_offer.groomer_id, v_entry.customer_id, v_offer.service_id,
            v_offer.slot_at, v_offer.duration_minutes, 'booked')
    returning * into v_appt;
  exception when exclusion_violation then
    raise exception 'That time was just booked. Pick another slot.' using errcode = '23P01';
  end;

  update public.waitlist_offers set status = 'claimed' where id = v_offer.id;
  update public.waitlist_entries set status = 'fulfilled', updated_at = now() where id = v_entry.id;

  select ga.auth_user_id into v_owner
  from public.groomers g join public.groomer_accounts ga on ga.id = g.owner_account_id
  where g.id = v_offer.groomer_id;
  perform app_private.notify(v_owner, 'waitlist_claimed', 'Waitlist slot claimed',
    'A waitlisted customer claimed an opening.', jsonb_build_object('appointmentId', v_appt.id));

  return v_appt;
end; $$;

-- 6. Groomer manually offers an opening ----------------------------------------
create or replace function public.offer_waitlist_slot(
  p_groomer_id uuid, p_slot_at timestamptz, p_service_id text
) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare v_offering public.groomer_service_offerings; v_offer uuid;
begin
  if not app_private.current_user_verified_for_groomer(p_groomer_id) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  select * into v_offering from public.groomer_service_offerings
  where groomer_id = p_groomer_id and service_id = p_service_id and is_active;
  v_offer := app_private.offer_to_next_waitlist_entry(
    p_groomer_id, p_service_id, p_slot_at, coalesce(v_offering.duration_minutes, 60));
  if v_offer is null then raise exception 'No matching waitlist entries.' using errcode = 'P0002'; end if;
  return v_offer;
end; $$;

-- 7. REPLACE cancel_appointment to add waitlist backfill -----------------------
create or replace function public.cancel_appointment(
  p_appointment_id uuid, p_reason text default null
) returns void
language plpgsql security definer set search_path = public, auth as $$
declare
  v_appt public.appointments; v_customer public.customers; v_owner uuid; v_is_customer boolean; v_groomer public.groomers;
begin
  select * into v_appt from public.appointments where id = p_appointment_id;
  if v_appt.id is null then raise exception 'Appointment not found.' using errcode = 'P0002'; end if;

  select * into v_customer from public.customers where id = v_appt.customer_id;
  v_is_customer := (v_customer.auth_user_id = (select auth.uid()));
  if not (v_is_customer or app_private.current_user_verified_for_groomer(v_appt.groomer_id)) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  update public.appointments set status = 'cancelled', status_updated_at = now() where id = v_appt.id;

  if v_is_customer then
    select ga.auth_user_id into v_owner from public.groomers g
      join public.groomer_accounts ga on ga.id = g.owner_account_id where g.id = v_appt.groomer_id;
    perform app_private.notify(v_owner, 'appointment_cancelled', 'Appointment cancelled',
      'A customer cancelled an appointment.', jsonb_build_object('appointmentId', v_appt.id));
  else
    perform app_private.notify(v_customer.auth_user_id, 'appointment_cancelled', 'Appointment cancelled',
      'Your groomer cancelled an appointment.', jsonb_build_object('appointmentId', v_appt.id));
  end if;

  -- Backfill: offer the freed slot to the next waitlist entry (opt-in groomers only).
  select * into v_groomer from public.groomers where id = v_appt.groomer_id;
  if v_groomer.accepts_waitlist and v_appt.service_id is not null then
    perform app_private.offer_to_next_waitlist_entry(
      v_appt.groomer_id, v_appt.service_id, v_appt.scheduled_at, v_appt.duration_minutes);
  end if;
end; $$;

-- Grants
revoke all on function public.claim_waitlist_offer(uuid) from public;
revoke all on function public.offer_waitlist_slot(uuid, timestamptz, text) from public;
grant execute on function public.claim_waitlist_offer(uuid) to authenticated;
grant execute on function public.offer_waitlist_slot(uuid, timestamptz, text) to authenticated;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: success.

- [ ] **Step 3: Verify objects**

```sql
select tablename from pg_tables where schemaname='public' and tablename in ('waitlist_entries','waitlist_offers');
select proname from pg_proc where proname in
  ('groomers_serving_point','offer_to_next_waitlist_entry','claim_waitlist_offer','offer_waitlist_slot');
```

Expected: 2 tables + 4 functions.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/*_add_waitlist.sql
git commit -m "feat(db): add waitlist tables, offer/claim RPCs, and cancel backfill"
```

---

## Task 2: Next-available server loader

**Files:**
- Create: `apps/web/server/nextAvailable.js`
- Test: `apps/web/server/nextAvailable.test.js`

- [ ] **Step 1: Write the failing test**

```js
// apps/web/server/nextAvailable.test.js
import { describe, it, expect } from 'vitest';
import { loadNextAvailable } from './nextAvailable.js';

const NOW = '2026-06-01T12:00:00.000Z';

// Mock supabase: rpc returns candidates; from(table) returns table rows ignoring filters.
function mockSupabase({ candidates, tables }) {
  return {
    rpc: async () => ({ data: candidates, error: null }),
    from(table) {
      const rows = tables[table] ?? [];
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        gte() { return builder; },
        lte() { return builder; },
        then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
      };
      return builder;
    },
  };
}

it('ranks the earliest slot across groomers and attaches groomer info', async () => {
  const supabase = mockSupabase({
    candidates: [{
      groomer_id: 'g1', name: 'Paws', timezone: 'America/New_York',
      booking_lead_time_hours: 2, duration_minutes: 60, price_cents: 8500, distance_meters: 1200,
    }],
    tables: {
      groomer_availability: [{ groomer_id: 'g1', weekday: 2, start_time: '09:00:00', end_time: '11:00:00' }],
      groomer_time_off: [],
      appointments: [],
    },
  });

  const results = await loadNextAvailable(supabase, {
    lat: 40.7, lng: -73.9, radiusM: 8000, serviceId: 'full-groom', limit: 5, nowIso: NOW,
  });

  expect(results[0]).toMatchObject({
    groomerId: 'g1', groomerName: 'Paws', priceCents: 8500, durationMinutes: 60,
    slotAt: '2026-06-02T13:00:00.000Z', distanceMeters: 1200,
  });
});

it('returns empty when no groomers serve the point', async () => {
  const supabase = mockSupabase({ candidates: [], tables: {} });
  const results = await loadNextAvailable(supabase, {
    lat: 0, lng: 0, radiusM: 1000, serviceId: 'full-groom', limit: 5, nowIso: NOW,
  });
  expect(results).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @paw-status/web -- server/nextAvailable`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// apps/web/server/nextAvailable.js
import { generateSlots } from '../../api/src/booking/slots.js';
import { NEXT_AVAIL_HORIZON_DAYS } from '../../api/src/booking/constants.js';

const PER_GROOMER = 3;

function trimTime(t) { return String(t).slice(0, 5); }

export async function loadNextAvailable(supabase, { lat, lng, radiusM, serviceId, limit = 10, nowIso }) {
  const now = nowIso || new Date().toISOString();
  const { data: candidates, error } = await supabase.rpc('groomers_serving_point', {
    p_lat: lat, p_lng: lng, p_radius_m: radiusM, p_service_id: serviceId,
  });
  if (error) throw new Error(error.message || 'Could not search groomers.');
  if (!candidates || candidates.length === 0) return [];

  const fromIso = now;
  const toIso = new Date(new Date(now).getTime() + NEXT_AVAIL_HORIZON_DAYS * 86_400_000).toISOString();

  const all = [];
  const activeStatuses = new Set(['booked', 'checked_in', 'bathing', 'drying', 'almost_ready', 'ready_for_pickup']);

  for (const c of candidates) {
    const { data: availability } = await supabase
      .from('groomer_availability').select('weekday, start_time, end_time').eq('groomer_id', c.groomer_id);
    const { data: timeOff } = await supabase
      .from('groomer_time_off').select('starts_at, ends_at').eq('groomer_id', c.groomer_id);
    const { data: busy } = await supabase
      .from('appointments').select('scheduled_at, duration_minutes, status').eq('groomer_id', c.groomer_id);

    const slots = generateSlots({
      fromIso, toIso, timezone: c.timezone || 'America/New_York',
      durationMinutes: c.duration_minutes, leadTimeHours: c.booking_lead_time_hours ?? 2,
      availability: (availability ?? []).map((a) => ({
        weekday: a.weekday, startTime: trimTime(a.start_time), endTime: trimTime(a.end_time),
      })),
      timeOff: (timeOff ?? []).map((t) => ({ startsAt: t.starts_at, endsAt: t.ends_at })),
      busy: (busy ?? []).filter((b) => activeStatuses.has(b.status))
        .map((b) => ({ scheduledAt: b.scheduled_at, durationMinutes: b.duration_minutes })),
      nowIso: now,
    });

    for (const slot of slots.slice(0, PER_GROOMER)) {
      all.push({
        groomerId: c.groomer_id, groomerName: c.name, priceCents: c.price_cents,
        durationMinutes: slot.durationMinutes, slotAt: slot.slotAt,
        distanceMeters: c.distance_meters, serviceId,
      });
    }
  }

  all.sort((a, b) => a.slotAt.localeCompare(b.slotAt));
  return all.slice(0, limit);
}

export function toPublicNextAvailableError(error) {
  return { statusCode: 500, body: { error: error?.message || 'Next-available search failed.' } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @paw-status/web -- server/nextAvailable`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/server/nextAvailable.js apps/web/server/nextAvailable.test.js
git commit -m "feat(server): add ranked next-available cross-groomer loader"
```

---

## Task 3: /api/next-available endpoint

**Files:**
- Create: `apps/web/netlify/functions/next-available.js`
- Modify: `apps/web/vite.config.js`
- Modify: `netlify.toml`

- [ ] **Step 1: Write the Netlify function**

```js
// apps/web/netlify/functions/next-available.js
import { createServerSupabaseClient } from '../../server/guestBooking.js';
import { loadNextAvailable, toPublicNextAvailableError } from '../../server/nextAvailable.js';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }
  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  try {
    const supabase = createServerSupabaseClient(process.env);
    const results = await loadNextAvailable(supabase, {
      lat: body.lat, lng: body.lng, radiusM: body.radiusM,
      serviceId: body.serviceId, limit: body.limit, nowIso: new Date().toISOString(),
    });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ results }),
    };
  } catch (error) {
    const publicError = toPublicNextAvailableError(error);
    return { statusCode: publicError.statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(publicError.body) };
  }
}
```

- [ ] **Step 2: Add the dev plugin to `vite.config.js`**

Add alongside the other `*DevPlugin` functions:

```js
function nextAvailableDevPlugin(env) {
  return {
    name: 'paw-status-next-available-dev',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url !== '/api/next-available') { next(); return; }
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Type', 'application/json');
        if (request.method !== 'POST') {
          response.statusCode = 405; response.end(JSON.stringify({ error: 'Method Not Allowed' })); return;
        }
        const chunks = [];
        request.on('data', (c) => chunks.push(c));
        request.on('end', async () => {
          let body = {};
          try { const raw = Buffer.concat(chunks).toString('utf8'); body = raw ? JSON.parse(raw) : {}; }
          catch { response.statusCode = 400; response.end(JSON.stringify({ error: 'Invalid JSON' })); return; }
          try {
            const { createServerSupabaseClient } = await import('./server/guestBooking.js');
            const { loadNextAvailable } = await import('./server/nextAvailable.js');
            const supabase = createServerSupabaseClient(env);
            const results = await loadNextAvailable(supabase, {
              lat: body.lat, lng: body.lng, radiusM: body.radiusM,
              serviceId: body.serviceId, limit: body.limit, nowIso: new Date().toISOString(),
            });
            response.statusCode = 200; response.end(JSON.stringify({ results }));
          } catch (error) {
            response.statusCode = 500; response.end(JSON.stringify({ error: error.message }));
          }
        });
      });
    },
  };
}
```

Then register it in the `plugins` array: add `nextAvailableDevPlugin(env)`.

- [ ] **Step 3: Add the redirect to `netlify.toml`** (before the SPA catch-all):

```toml
[[redirects]]
  from = "/api/next-available"
  to = "/.netlify/functions/next-available"
  status = 200
```

- [ ] **Step 4: Verify build + route**

Run: `npm run build`
Expected: succeeds.

Run (dev server up): `curl -s -X POST http://localhost:5173/api/next-available -H 'Content-Type: application/json' -d '{"lat":40.7,"lng":-73.9,"radiusM":8000,"serviceId":"full-groom","limit":5}'`
Expected: `{"results":[...]}` (possibly empty array if no groomers serve that point — still success).

- [ ] **Step 5: Commit**

```bash
git add apps/web/netlify/functions/next-available.js apps/web/vite.config.js netlify.toml
git commit -m "feat(api): expose /api/next-available endpoint"
```

---

## Task 4: waitlist api module

**Files:**
- Create: `apps/web/src/api/waitlist.js`
- Test: `apps/web/src/api/waitlist.test.js`

- [ ] **Step 1: Write the failing test**

```js
// apps/web/src/api/waitlist.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();
vi.mock('../lib/supabaseClient.js', () => ({ requireSupabaseClient: () => ({ rpc, from }) }));

import { joinWaitlist, claimOffer, offerSlot, fetchNextAvailable } from './waitlist.js';

beforeEach(() => { rpc.mockReset(); from.mockReset(); });
afterEach(() => vi.restoreAllMocks());

it('joinWaitlist inserts an entry (global when groomerId is null)', async () => {
  const single = vi.fn().mockResolvedValue({ data: { id: 'w1' }, error: null });
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  from.mockReturnValue({ insert });

  await joinWaitlist({
    customerId: 'c1', dogId: 'd1', groomerId: null, serviceId: 'full-groom',
    searchLat: 40.7, searchLng: -73.9, maxDistanceMeters: 8000,
  });
  expect(from).toHaveBeenCalledWith('waitlist_entries');
  expect(insert).toHaveBeenCalledWith({
    customer_id: 'c1', dog_id: 'd1', groomer_id: null, service_id: 'full-groom',
    search_lat: 40.7, search_lng: -73.9, max_distance_meters: 8000,
    desired_after: null, desired_before: null,
  });
});

it('claimOffer calls the rpc', async () => {
  rpc.mockResolvedValue({ data: { id: 'a1' }, error: null });
  const appt = await claimOffer({ offerId: 'o1' });
  expect(rpc).toHaveBeenCalledWith('claim_waitlist_offer', { p_offer_id: 'o1' });
  expect(appt).toEqual({ id: 'a1' });
});

it('claimOffer surfaces the unavailable message', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'This offer is no longer available.' } });
  await expect(claimOffer({ offerId: 'o1' })).rejects.toThrow('This offer is no longer available.');
});

it('offerSlot calls the rpc with the groomer slot', async () => {
  rpc.mockResolvedValue({ data: 'o1', error: null });
  await offerSlot({ groomerId: 'g1', slotAt: '2026-06-02T13:00:00.000Z', serviceId: 'full-groom' });
  expect(rpc).toHaveBeenCalledWith('offer_waitlist_slot', {
    p_groomer_id: 'g1', p_slot_at: '2026-06-02T13:00:00.000Z', p_service_id: 'full-groom',
  });
});

it('fetchNextAvailable posts the search and returns results', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, json: async () => ({ results: [{ groomerId: 'g1', slotAt: 't' }] }),
  }));
  const results = await fetchNextAvailable({ lat: 1, lng: 2, radiusM: 8000, serviceId: 'full-groom' });
  expect(results).toEqual([{ groomerId: 'g1', slotAt: 't' }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @paw-status/web -- src/api/waitlist`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// apps/web/src/api/waitlist.js
import { requireSupabaseClient } from '../lib/supabaseClient.js';

function unwrap({ data, error }, fallback) {
  if (error) throw new Error(error.message || fallback);
  return data;
}

export async function joinWaitlist({
  customerId, dogId, groomerId = null, serviceId,
  searchLat = null, searchLng = null, maxDistanceMeters = null,
  desiredAfter = null, desiredBefore = null,
}) {
  const supabase = requireSupabaseClient();
  const result = await supabase
    .from('waitlist_entries')
    .insert({
      customer_id: customerId, dog_id: dogId, groomer_id: groomerId, service_id: serviceId,
      search_lat: searchLat, search_lng: searchLng, max_distance_meters: maxDistanceMeters,
      desired_after: desiredAfter, desired_before: desiredBefore,
    })
    .select()
    .single();
  return unwrap(result, 'Could not join the waitlist.');
}

export async function loadMyWaitlist({ customerId }) {
  const supabase = requireSupabaseClient();
  const result = await supabase
    .from('waitlist_entries')
    .select('id, groomer_id, service_id, status, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  return unwrap(result, 'Could not load your waitlist.') ?? [];
}

export async function loadMyOffers({ customerId }) {
  const supabase = requireSupabaseClient();
  // RLS already limits offers to the caller's entries; filter to pending here.
  const result = await supabase
    .from('waitlist_offers')
    .select('id, groomer_id, slot_at, duration_minutes, service_id, expires_at, status')
    .eq('status', 'pending')
    .order('slot_at', { ascending: true });
  return unwrap(result, 'Could not load your offers.') ?? [];
}

export async function claimOffer({ offerId }) {
  const supabase = requireSupabaseClient();
  const result = await supabase.rpc('claim_waitlist_offer', { p_offer_id: offerId });
  return unwrap(result, 'Could not claim the offer.');
}

export async function loadGroomerWaitlist({ groomerId }) {
  const supabase = requireSupabaseClient();
  const result = await supabase
    .from('waitlist_entries')
    .select('id, dog_id, service_id, status, created_at')
    .eq('groomer_id', groomerId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  return unwrap(result, 'Could not load the waitlist.') ?? [];
}

export async function offerSlot({ groomerId, slotAt, serviceId }) {
  const supabase = requireSupabaseClient();
  const result = await supabase.rpc('offer_waitlist_slot', {
    p_groomer_id: groomerId, p_slot_at: slotAt, p_service_id: serviceId,
  });
  return unwrap(result, 'Could not offer the slot.');
}

export async function fetchNextAvailable({ lat, lng, radiusM, serviceId, limit = 10 }) {
  const response = await fetch('/api/next-available', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng, radiusM, serviceId, limit }),
  });
  if (!response.ok) {
    let message = 'Could not search openings.';
    try { const body = await response.json(); if (body?.error) message = body.error; } catch { /* keep default */ }
    throw new Error(message);
  }
  const body = await response.json();
  return Array.isArray(body.results) ? body.results : [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @paw-status/web -- src/api/waitlist`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/api/waitlist.js apps/web/src/api/waitlist.test.js
git commit -m "feat(api): add waitlist + next-available data access"
```

---

## Task 5: NextAvailablePanel (customer)

**Files:**
- Create: `apps/web/src/customer/NextAvailablePanel.jsx`
- Test: `apps/web/src/customer/NextAvailablePanel.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/web/src/customer/NextAvailablePanel.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const fetchNextAvailable = vi.fn();
const joinWaitlist = vi.fn();
vi.mock('../api/waitlist.js', () => ({ fetchNextAvailable, joinWaitlist }));

import { NextAvailablePanel } from './NextAvailablePanel.jsx';

beforeEach(() => { fetchNextAvailable.mockReset(); joinWaitlist.mockReset(); });

const base = {
  serviceId: 'full-groom', lat: 40.7, lng: -73.9, radiusM: 8000,
  customerId: 'c1', dogId: 'd1',
};

it('searches and lists the soonest openings', async () => {
  fetchNextAvailable.mockResolvedValue([
    { groomerId: 'g1', groomerName: 'Paws', slotAt: '2026-06-02T13:00:00.000Z', priceCents: 8500, durationMinutes: 60 },
  ]);
  render(<NextAvailablePanel {...base} onBook={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /search/i }));
  await waitFor(() => expect(fetchNextAvailable).toHaveBeenCalled());
  expect(await screen.findByText('Paws')).toBeInTheDocument();
});

it('joins the global waitlist', async () => {
  joinWaitlist.mockResolvedValue({ id: 'w1' });
  render(<NextAvailablePanel {...base} onBook={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /notify me/i }));
  await waitFor(() => expect(joinWaitlist).toHaveBeenCalledWith(expect.objectContaining({
    customerId: 'c1', dogId: 'd1', groomerId: null, serviceId: 'full-groom',
    searchLat: 40.7, searchLng: -73.9, maxDistanceMeters: 8000,
  })));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @paw-status/web -- NextAvailablePanel`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```jsx
// apps/web/src/customer/NextAvailablePanel.jsx
import { useState } from 'react';
import { fetchNextAvailable, joinWaitlist } from '../api/waitlist.js';

function formatSlot(iso) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso));
}

export function NextAvailablePanel({ serviceId, lat, lng, radiusM, customerId, dogId, onBook }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function search() {
    setLoading(true); setError(''); setStatus('');
    try {
      setResults(await fetchNextAvailable({ lat, lng, radiusM, serviceId }));
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }

  async function notifyMe() {
    setError(''); setStatus('');
    try {
      await joinWaitlist({
        customerId, dogId, groomerId: null, serviceId,
        searchLat: lat, searchLng: lng, maxDistanceMeters: radiusM,
      });
      setStatus("You're on the waitlist — we'll notify you when a slot opens.");
    } catch (err) { setError(err.message); }
  }

  return (
    <section className="next-available" aria-label="Next available openings">
      <div className="next-available-actions">
        <button type="button" onClick={search} disabled={loading}>
          {loading ? 'Searching…' : 'Search soonest openings'}
        </button>
        <button type="button" onClick={notifyMe}>Notify me of the next opening</button>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      {status && <p className="form-status" role="status">{status}</p>}
      <ul className="next-available-results">
        {results.map((r) => (
          <li key={`${r.groomerId}:${r.slotAt}`}>
            <span><strong>{r.groomerName}</strong> — {formatSlot(r.slotAt)} (${(r.priceCents / 100).toFixed(0)})</span>
            <button type="button" onClick={() => onBook?.(r)}>Book</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

> The parent's `onBook(result)` should create a booking request at `result.slotAt` for `result.groomerId` via `createSlotBookingRequest` (Phase 3) — wire it where `NextAvailablePanel` is rendered.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @paw-status/web -- NextAvailablePanel`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/customer/NextAvailablePanel.jsx apps/web/src/customer/NextAvailablePanel.test.jsx
git commit -m "feat(customer): add next-available search + global waitlist panel"
```

---

## Task 6: WaitlistOffers (customer claim)

**Files:**
- Create: `apps/web/src/customer/WaitlistOffers.jsx`
- Test: `apps/web/src/customer/WaitlistOffers.test.jsx`
- Modify: `apps/web/src/customer/BookingsListPanel.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/web/src/customer/WaitlistOffers.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const loadMyOffers = vi.fn();
const claimOffer = vi.fn();
vi.mock('../api/waitlist.js', () => ({ loadMyOffers, claimOffer }));

import { WaitlistOffers } from './WaitlistOffers.jsx';

beforeEach(() => { loadMyOffers.mockReset(); claimOffer.mockReset(); });

it('lists pending offers and claims one', async () => {
  loadMyOffers.mockResolvedValue([
    { id: 'o1', groomer_id: 'g1', slot_at: '2026-06-02T13:00:00.000Z', expires_at: '2026-06-02T13:30:00.000Z', service_id: 'full-groom' },
  ]);
  claimOffer.mockResolvedValue({ id: 'a1' });
  render(<WaitlistOffers customerId="c1" />);
  expect(await screen.findByRole('button', { name: /claim/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /claim/i }));
  await waitFor(() => expect(claimOffer).toHaveBeenCalledWith({ offerId: 'o1' }));
});

it('renders nothing when there are no offers', async () => {
  loadMyOffers.mockResolvedValue([]);
  const { container } = render(<WaitlistOffers customerId="c1" />);
  await waitFor(() => expect(loadMyOffers).toHaveBeenCalled());
  expect(container.querySelector('.waitlist-offer')).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @paw-status/web -- WaitlistOffers`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```jsx
// apps/web/src/customer/WaitlistOffers.jsx
import { useEffect, useState } from 'react';
import { loadMyOffers, claimOffer } from '../api/waitlist.js';

function formatSlot(iso) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso));
}

export function WaitlistOffers({ customerId }) {
  const [offers, setOffers] = useState([]);
  const [error, setError] = useState('');

  async function refresh() {
    try { setOffers(await loadMyOffers({ customerId })); }
    catch (err) { setError(err.message); }
  }

  useEffect(() => { if (customerId) refresh(); /* eslint-disable-next-line */ }, [customerId]);

  async function claim(offerId) {
    setError('');
    try { await claimOffer({ offerId }); await refresh(); }
    catch (err) { setError(err.message); }
  }

  if (offers.length === 0) return error ? <p className="field-error" role="alert">{error}</p> : null;

  return (
    <section className="waitlist-offers" aria-label="Waitlist offers">
      <h3>A slot opened up!</h3>
      {error && <p className="field-error" role="alert">{error}</p>}
      <ul>
        {offers.map((o) => (
          <li key={o.id} className="waitlist-offer">
            <span>{formatSlot(o.slot_at)} — expires {formatSlot(o.expires_at)}</span>
            <button type="button" onClick={() => claim(o.id)}>Claim</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @paw-status/web -- WaitlistOffers`
Expected: PASS (2 tests).

- [ ] **Step 5: Mount in BookingsListPanel**

**Read `BookingsListPanel.jsx` first.** Render `WaitlistOffers` at the top of the bookings list for the signed-in customer:

```jsx
import { WaitlistOffers } from './WaitlistOffers.jsx';
// near the top of the panel's returned JSX:
<WaitlistOffers customerId={customerId} />
```

> Match `customerId` to the prop/value the panel already has for the current customer.

- [ ] **Step 6: Verify build + bookings tests**

Run: `npm run build`
Expected: succeeds.

Run: `npm test --workspace @paw-status/web -- BookingsListPanel`
Expected: existing tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/customer/WaitlistOffers.jsx apps/web/src/customer/WaitlistOffers.test.jsx apps/web/src/customer/BookingsListPanel.jsx
git commit -m "feat(customer): claim waitlist offers from the bookings list"
```

---

## Task 7: WaitlistInbox (groomer) + Waitlist tab

**Files:**
- Create: `apps/web/src/groomer/WaitlistInbox.jsx`
- Modify: `apps/web/src/groomer/StaffDashboard.jsx`

> Shows the groomer's per-groomer waitlist entries and lets them offer an open slot. Reuses `SlotPicker` (Phase 3) to pick the slot to offer.

- [ ] **Step 1: Write the component**

```jsx
// apps/web/src/groomer/WaitlistInbox.jsx
import { useEffect, useState } from 'react';
import { loadGroomerWaitlist, offerSlot } from '../api/waitlist.js';
import { SlotPicker } from '../customer/SlotPicker.jsx';

export function WaitlistInbox({ groomerId }) {
  const [entries, setEntries] = useState([]);
  const [offerFor, setOfferFor] = useState(null); // serviceId currently offering
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function refresh() {
    try { setEntries(await loadGroomerWaitlist({ groomerId })); }
    catch (err) { setError(err.message); }
  }

  useEffect(() => { if (groomerId) refresh(); /* eslint-disable-next-line */ }, [groomerId]);

  async function offer(serviceId, slot) {
    setError(''); setStatus('');
    try {
      await offerSlot({ groomerId, slotAt: slot.slotAt, serviceId });
      setStatus('Offer sent to the next waitlisted customer.');
      setOfferFor(null);
      await refresh();
    } catch (err) { setError(err.message); }
  }

  return (
    <section className="waitlist-inbox" aria-label="Waitlist">
      <h3>Waitlist</h3>
      {error && <p className="field-error" role="alert">{error}</p>}
      {status && <p className="form-status" role="status">{status}</p>}
      {entries.length === 0 && <p>No one is waiting right now.</p>}
      <ul>
        {entries.map((e) => (
          <li key={e.id}>
            <span>{e.service_id}</span>
            <button type="button" onClick={() => setOfferFor(e.service_id)}>Offer a slot</button>
          </li>
        ))}
      </ul>
      {offerFor && (
        <div className="waitlist-offer-picker">
          <p>Pick an opening to offer for {offerFor}:</p>
          <SlotPicker groomerId={groomerId} serviceId={offerFor} onPick={(slot) => offer(offerFor, slot)} />
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Add a Waitlist tab in StaffDashboard**

**Read `StaffDashboard.jsx`.** Add `WaitlistInbox` as a tab/section (alongside the Requests tab from Phase 3), passing the verified groomer's id:

```jsx
import { WaitlistInbox } from './WaitlistInbox.jsx';
// where the groomer's verified groomer id is known (from the workspace membership):
<WaitlistInbox groomerId={groomerId} />
```

> Match `groomerId` to the verified membership's `groomer_id` already available in the workspace.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds.

Run: `npm test --workspace @paw-status/web -- StaffDashboard`
Expected: existing tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/groomer/WaitlistInbox.jsx apps/web/src/groomer/StaffDashboard.jsx
git commit -m "feat(groomer): add waitlist inbox with manual slot offers"
```

---

## CHECKPOINT — Phase 4 complete

Manual verification (dev + hosted Supabase, two customers + one waitlist-opted-in groomer):
- [ ] `npm test` green; `npm run build` succeeds; `git diff --check` clean.
- [ ] **Global search:** as a customer, "Search soonest openings" returns ranked slots across groomers; "Book" creates a request.
- [ ] **Backfill loop:** Customer A books and the groomer confirms. Customer B joins that groomer's waitlist (groomer has `accepts_waitlist = true`). Customer A cancels → Customer B gets a live `waitlist_offer` notification → "Claim" → an `appointments` row is created at the freed slot; the entry is `fulfilled`.
- [ ] **Manual offer:** in the groomer Waitlist tab, "Offer a slot" sends an offer to the next waitlisted customer.
- [ ] Claiming an expired/taken offer shows "This offer is no longer available."

**Deliverable:** the waitlist loop is demoable end to end. Phase 5 adds the mock deposit + GBP/Square connect.
