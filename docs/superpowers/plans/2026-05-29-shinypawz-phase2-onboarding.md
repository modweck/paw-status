# ShinyPawz Phase 2 — Groomer Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a groomer sign up (password-first) and self-onboard through a 5-step wizard that produces a real `groomers` business with location, services + pricing, weekly availability, and a waitlist opt-in — the data the Phase 1 slot engine consumes.

**Architecture:** A `SECURITY DEFINER` RPC (`create_owned_groomer`) atomically creates the `groomers` row plus an auto-verified `owner` membership, so self-created groomers skip admin review. A second RPC (`refresh_groomer_services`) keeps `groomers.services` (jsonb, used by `nearby_groomers`) derived from `groomer_service_offerings` with zero drift. A pure validation module backs a `OnboardingWizard` whose steps write through a thin `groomerOnboarding` api module. `StaffDashboard` branches to the wizard until a verified membership exists.

**Tech Stack:** Supabase Postgres (`SECURITY DEFINER` RPCs, RLS, PostGIS), React 18 (JSX), Vitest + Testing Library. **npm only.**

**Depends on:** Phase 1 (the `groomers` config columns, `groomer_service_offerings`, `groomer_availability`, `groomer_time_off` tables, and `app_private.current_user_verified_for_groomer`).

**Spec:** `docs/superpowers/specs/2026-05-29-shinypawz-demo-ready-design.md` (§5.1–5.3, §7 `create_owned_groomer`, §10 Flow 1, §11, §17 Phase 2).

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/*_add_onboarding_rpcs_and_groomer_update_policy.sql` | `create_owned_groomer`, `refresh_groomer_services`, verified-groomer UPDATE policy on `groomers`. |
| `apps/web/src/api/groomerOnboarding.js` | Client wrappers: create groomer, save offering, save/delete availability, save time-off, set waitlist, load my groomer. |
| `apps/web/src/api/groomerOnboarding.test.js` | Tests (mock supabase). |
| `apps/web/src/groomer/onboarding/validation.js` | Pure per-step validators. |
| `apps/web/src/groomer/onboarding/validation.test.js` | Validator unit tests. |
| `apps/web/src/groomer/AvailabilityEditor.jsx` | Weekly-hours grid editor (reused in settings). |
| `apps/web/src/groomer/ServiceOfferingsEditor.jsx` | Pick services + set duration/price. |
| `apps/web/src/groomer/onboarding/OnboardingWizard.jsx` | Step orchestration + submit. |
| `apps/web/src/groomer/onboarding/steps.jsx` | The 5 step components (small, colocated). |
| `apps/web/src/groomer/onboarding/OnboardingWizard.test.jsx` | Navigation + gating component test. |
| `apps/web/src/groomer/StaffDashboard.jsx` (modify) | Branch to wizard when no verified membership. |
| `apps/web/src/auth/LoginPanel.jsx` (modify) | "I'm a groomer" intent. |

---

## Task 1: Onboarding RPCs + groomer update policy

**Files:**
- Create: `supabase/migrations/<timestamp>_add_onboarding_rpcs_and_groomer_update_policy.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Verified groomers may UPDATE their own groomers row (settings, waitlist opt-in, location edits).
drop policy if exists "verified groomer updates own groomer" on public.groomers;
create policy "verified groomer updates own groomer" on public.groomers
  for update
  using (app_private.current_user_verified_for_groomer(id))
  with check (app_private.current_user_verified_for_groomer(id));

-- Atomically create a self-owned groomer + an auto-verified owner membership.
create or replace function public.create_owned_groomer(
  p_name text,
  p_location_mode text,
  p_address text,
  p_lat double precision,
  p_lng double precision,
  p_service_radius_meters integer,
  p_timezone text,
  p_phone text,
  p_bio text
) returns public.groomers
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_account public.groomer_accounts;
  v_groomer public.groomers;
begin
  select * into v_account
  from public.groomer_accounts
  where auth_user_id = (select auth.uid());

  if v_account.id is null then
    raise exception 'You need a groomer account first.' using errcode = '42501';
  end if;

  if p_location_mode not in ('salon','mobile') then
    raise exception 'location_mode must be salon or mobile.' using errcode = '22023';
  end if;

  insert into public.groomers (
    name, location_mode, address, lat, lng, location,
    service_radius_meters, timezone, phone, bio, owner_account_id, services
  ) values (
    p_name, p_location_mode, p_address, p_lat, p_lng,
    case when p_lat is not null and p_lng is not null
      then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
      else null end,
    p_service_radius_meters, coalesce(p_timezone, 'America/New_York'),
    p_phone, p_bio, v_account.id, '[]'::jsonb
  ) returning * into v_groomer;

  insert into public.groomer_memberships (groomer_account_id, groomer_id, role, status)
  values (v_account.id, v_groomer.id, 'owner', 'verified');

  return v_groomer;
end;
$$;

revoke all on function public.create_owned_groomer(
  text, text, text, double precision, double precision, integer, text, text, text) from public;
grant execute on function public.create_owned_groomer(
  text, text, text, double precision, double precision, integer, text, text, text) to authenticated;

-- Recompute groomers.services from active offerings (no drift, no extra update needed by clients).
create or replace function public.refresh_groomer_services(p_groomer_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not app_private.current_user_verified_for_groomer(p_groomer_id) then
    raise exception 'Not authorized for this groomer.' using errcode = '42501';
  end if;
  update public.groomers g
  set services = coalesce((
    select jsonb_agg(distinct o.service_id)
    from public.groomer_service_offerings o
    where o.groomer_id = p_groomer_id and o.is_active
  ), '[]'::jsonb)
  where g.id = p_groomer_id;
end;
$$;

revoke all on function public.refresh_groomer_services(uuid) from public;
grant execute on function public.refresh_groomer_services(uuid) to authenticated;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: success.

- [ ] **Step 3: Verify the functions exist**

```sql
select proname from pg_proc
where proname in ('create_owned_groomer','refresh_groomer_services');
```

Expected: 2 rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/*_add_onboarding_rpcs_and_groomer_update_policy.sql
git commit -m "feat(db): add create_owned_groomer + refresh_groomer_services RPCs"
```

---

## Task 2: groomerOnboarding api module

**Files:**
- Create: `apps/web/src/api/groomerOnboarding.js`
- Test: `apps/web/src/api/groomerOnboarding.test.js`

> Follow the existing `apps/web/src/api/*` idiom: use `requireSupabaseClient()` from `../lib/supabaseClient.js`, throw `Error(message)` on failure, return mapped data.

- [ ] **Step 1: Write the failing test**

```js
// apps/web/src/api/groomerOnboarding.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();
vi.mock('../lib/supabaseClient.js', () => ({
  requireSupabaseClient: () => ({ rpc, from }),
}));

import {
  createOwnedGroomer, saveOffering, saveAvailabilityBlock, setWaitlistOptIn,
} from './groomerOnboarding.js';

beforeEach(() => { rpc.mockReset(); from.mockReset(); });

it('createOwnedGroomer maps camelCase input to snake_case rpc params', async () => {
  rpc.mockResolvedValue({ data: { id: 'g1', name: 'Paws' }, error: null });
  const groomer = await createOwnedGroomer({
    name: 'Paws', locationMode: 'mobile', address: null, lat: 40.7, lng: -73.9,
    serviceRadiusMeters: 8000, timezone: 'America/New_York', phone: '555', bio: 'hi',
  });
  expect(rpc).toHaveBeenCalledWith('create_owned_groomer', {
    p_name: 'Paws', p_location_mode: 'mobile', p_address: null, p_lat: 40.7, p_lng: -73.9,
    p_service_radius_meters: 8000, p_timezone: 'America/New_York', p_phone: '555', p_bio: 'hi',
  });
  expect(groomer).toEqual({ id: 'g1', name: 'Paws' });
});

it('createOwnedGroomer throws the supabase error message', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'You need a groomer account first.' } });
  await expect(createOwnedGroomer({
    name: 'X', locationMode: 'salon', lat: 1, lng: 2,
  })).rejects.toThrow('You need a groomer account first.');
});

it('saveOffering upserts then refreshes the services jsonb', async () => {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  from.mockReturnValue({ upsert });
  rpc.mockResolvedValue({ error: null });
  await saveOffering({ groomerId: 'g1', serviceId: 'full-groom', durationMinutes: 90, priceCents: 8500 });
  expect(from).toHaveBeenCalledWith('groomer_service_offerings');
  expect(upsert).toHaveBeenCalledWith(
    { groomer_id: 'g1', service_id: 'full-groom', duration_minutes: 90, price_cents: 8500, is_active: true },
    { onConflict: 'groomer_id,service_id' },
  );
  expect(rpc).toHaveBeenCalledWith('refresh_groomer_services', { p_groomer_id: 'g1' });
});

it('saveAvailabilityBlock inserts a row', async () => {
  const insert = vi.fn().mockResolvedValue({ error: null });
  from.mockReturnValue({ insert });
  await saveAvailabilityBlock({ groomerId: 'g1', weekday: 2, startTime: '09:00', endTime: '17:00' });
  expect(from).toHaveBeenCalledWith('groomer_availability');
  expect(insert).toHaveBeenCalledWith({
    groomer_id: 'g1', weekday: 2, start_time: '09:00', end_time: '17:00',
  });
});

it('setWaitlistOptIn updates the groomers row', async () => {
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq });
  from.mockReturnValue({ update });
  await setWaitlistOptIn({ groomerId: 'g1', accepts: true });
  expect(update).toHaveBeenCalledWith({ accepts_waitlist: true });
  expect(eq).toHaveBeenCalledWith('id', 'g1');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @paw-status/web -- groomerOnboarding`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// apps/web/src/api/groomerOnboarding.js
import { requireSupabaseClient } from '../lib/supabaseClient.js';

function unwrap({ data, error }, fallback) {
  if (error) throw new Error(error.message || fallback);
  return data;
}

export async function createOwnedGroomer({
  name, locationMode, address = null, lat = null, lng = null,
  serviceRadiusMeters = null, timezone = 'America/New_York', phone = null, bio = null,
}) {
  const supabase = requireSupabaseClient();
  const result = await supabase.rpc('create_owned_groomer', {
    p_name: name, p_location_mode: locationMode, p_address: address,
    p_lat: lat, p_lng: lng, p_service_radius_meters: serviceRadiusMeters,
    p_timezone: timezone, p_phone: phone, p_bio: bio,
  });
  return unwrap(result, 'Could not create groomer.');
}

export async function saveOffering({ groomerId, serviceId, durationMinutes, priceCents }) {
  const supabase = requireSupabaseClient();
  const { error } = await supabase.from('groomer_service_offerings').upsert(
    {
      groomer_id: groomerId, service_id: serviceId,
      duration_minutes: durationMinutes, price_cents: priceCents, is_active: true,
    },
    { onConflict: 'groomer_id,service_id' },
  );
  if (error) throw new Error(error.message || 'Could not save service.');
  const refresh = await supabase.rpc('refresh_groomer_services', { p_groomer_id: groomerId });
  if (refresh.error) throw new Error(refresh.error.message || 'Could not sync services.');
}

export async function saveAvailabilityBlock({ groomerId, weekday, startTime, endTime }) {
  const supabase = requireSupabaseClient();
  const { error } = await supabase.from('groomer_availability').insert({
    groomer_id: groomerId, weekday, start_time: startTime, end_time: endTime,
  });
  if (error) throw new Error(error.message || 'Could not save availability.');
}

export async function deleteAvailabilityBlock({ blockId }) {
  const supabase = requireSupabaseClient();
  const { error } = await supabase.from('groomer_availability').delete().eq('id', blockId);
  if (error) throw new Error(error.message || 'Could not remove availability.');
}

export async function saveTimeOff({ groomerId, startsAt, endsAt, reason = null }) {
  const supabase = requireSupabaseClient();
  const { error } = await supabase.from('groomer_time_off').insert({
    groomer_id: groomerId, starts_at: startsAt, ends_at: endsAt, reason,
  });
  if (error) throw new Error(error.message || 'Could not save time off.');
}

export async function setWaitlistOptIn({ groomerId, accepts }) {
  const supabase = requireSupabaseClient();
  const { error } = await supabase.from('groomers').update({ accepts_waitlist: accepts }).eq('id', groomerId);
  if (error) throw new Error(error.message || 'Could not update waitlist setting.');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @paw-status/web -- groomerOnboarding`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/api/groomerOnboarding.js apps/web/src/api/groomerOnboarding.test.js
git commit -m "feat(api): add groomer onboarding data-access module"
```

---

## Task 3: Onboarding validation module

**Files:**
- Create: `apps/web/src/groomer/onboarding/validation.js`
- Test: `apps/web/src/groomer/onboarding/validation.test.js`

- [ ] **Step 1: Write the failing test**

```js
// apps/web/src/groomer/onboarding/validation.test.js
import { describe, it, expect } from 'vitest';
import {
  validateBusiness, validateLocation, validateServices, validateAvailability, isValid,
} from './validation.js';

it('business requires a name', () => {
  expect(isValid(validateBusiness({ name: '' }))).toBe(false);
  expect(isValid(validateBusiness({ name: 'Paws & Claws' }))).toBe(true);
});

it('salon location requires a geocoded address', () => {
  expect(isValid(validateLocation({ locationMode: 'salon', address: '', lat: null, lng: null }))).toBe(false);
  expect(isValid(validateLocation({ locationMode: 'salon', address: '1 St', lat: 1, lng: 2 }))).toBe(true);
});

it('mobile location requires a base point and a positive radius', () => {
  expect(isValid(validateLocation({ locationMode: 'mobile', lat: 1, lng: 2, serviceRadiusMiles: 0 }))).toBe(false);
  expect(isValid(validateLocation({ locationMode: 'mobile', lat: 1, lng: 2, serviceRadiusMiles: 5 }))).toBe(true);
});

it('services require at least one selection with valid duration and price', () => {
  expect(isValid(validateServices([]))).toBe(false);
  expect(isValid(validateServices([
    { serviceId: 'full-groom', selected: true, durationMinutes: 0, priceCents: 8500 },
  ]))).toBe(false);
  expect(isValid(validateServices([
    { serviceId: 'full-groom', selected: true, durationMinutes: 90, priceCents: 8500 },
  ]))).toBe(true);
});

it('availability requires at least one block with end after start', () => {
  expect(isValid(validateAvailability([]))).toBe(false);
  expect(isValid(validateAvailability([{ id: 'a', startTime: '17:00', endTime: '09:00' }]))).toBe(false);
  expect(isValid(validateAvailability([{ id: 'a', startTime: '09:00', endTime: '17:00' }]))).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @paw-status/web -- onboarding/validation`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// apps/web/src/groomer/onboarding/validation.js
export function validateBusiness({ name }) {
  const errors = {};
  if (!name || !name.trim()) errors.name = 'Business name is required.';
  return errors;
}

export function validateLocation({ locationMode, address, lat, lng, serviceRadiusMiles }) {
  const errors = {};
  if (locationMode === 'salon') {
    if (!address || !address.trim() || lat == null || lng == null) {
      errors.address = 'Pick a salon address.';
    }
  } else if (locationMode === 'mobile') {
    if (lat == null || lng == null) errors.address = 'Set your base location.';
    if (!(serviceRadiusMiles > 0)) errors.radius = 'Service radius must be greater than 0.';
  } else {
    errors.locationMode = 'Choose salon or mobile.';
  }
  return errors;
}

export function validateServices(offerings) {
  const errors = {};
  const active = offerings.filter((o) => o.selected);
  if (active.length === 0) {
    errors.services = 'Select at least one service.';
    return errors;
  }
  for (const o of active) {
    if (!(o.durationMinutes > 0)) errors[`${o.serviceId}:duration`] = 'Duration must be greater than 0.';
    if (o.priceCents == null || o.priceCents === '' || Number(o.priceCents) < 0) {
      errors[`${o.serviceId}:price`] = 'Enter a valid price.';
    }
  }
  return errors;
}

export function validateAvailability(blocks) {
  const errors = {};
  if (blocks.length === 0) {
    errors.availability = 'Add at least one availability block.';
    return errors;
  }
  for (const b of blocks) {
    if (b.endTime <= b.startTime) errors[b.id] = 'End time must be after start time.';
  }
  return errors;
}

export function isValid(errors) {
  return Object.keys(errors).length === 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @paw-status/web -- onboarding/validation`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/groomer/onboarding/validation.js apps/web/src/groomer/onboarding/validation.test.js
git commit -m "feat(groomer): add onboarding step validators"
```

---

## Task 4: AvailabilityEditor component

**Files:**
- Create: `apps/web/src/groomer/AvailabilityEditor.jsx`

> Presentational + local-state editor. Parent owns the `blocks` array and `onChange`. Reused in onboarding Step 4 and (later) settings.

- [ ] **Step 1: Write the component**

```jsx
// apps/web/src/groomer/AvailabilityEditor.jsx
import { useState } from 'react';

const WEEKDAYS = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

let blockSeq = 0;
function nextBlockId() {
  blockSeq += 1;
  return `block-${blockSeq}`;
}

export function AvailabilityEditor({ blocks, onChange }) {
  const [weekday, setWeekday] = useState(2);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');

  function addBlock() {
    if (endTime <= startTime) return;
    onChange([...blocks, { id: nextBlockId(), weekday, startTime, endTime }]);
  }

  function removeBlock(id) {
    onChange(blocks.filter((b) => b.id !== id));
  }

  return (
    <div className="availability-editor">
      <div className="availability-add" role="group" aria-label="Add availability block">
        <select aria-label="Weekday" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
          {WEEKDAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <input aria-label="Start time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        <input aria-label="End time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        <button type="button" onClick={addBlock}>Add</button>
      </div>
      <ul className="availability-list">
        {blocks.map((b) => (
          <li key={b.id}>
            <span>{WEEKDAYS.find((d) => d.value === b.weekday)?.label} {b.startTime}–{b.endTime}</span>
            <button type="button" aria-label={`Remove ${b.id}`} onClick={() => removeBlock(b.id)}>Remove</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Verify it parses (build)**

Run: `npm run build`
Expected: build succeeds (the component compiles).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/groomer/AvailabilityEditor.jsx
git commit -m "feat(groomer): add AvailabilityEditor weekly hours component"
```

---

## Task 5: ServiceOfferingsEditor component

**Files:**
- Create: `apps/web/src/groomer/ServiceOfferingsEditor.jsx`

> Reads the service catalog from `../data/services.js`. Parent owns `offerings` (one entry per catalog service: `{ serviceId, selected, durationMinutes, priceCents }`) and `onChange`.

- [ ] **Step 1: Write the component**

```jsx
// apps/web/src/groomer/ServiceOfferingsEditor.jsx
import { SERVICES } from '../data/services.js';

// `offerings` is an array of { serviceId, selected, durationMinutes, priceCents (string|number) }.
export function ServiceOfferingsEditor({ offerings, onChange }) {
  function update(serviceId, patch) {
    onChange(offerings.map((o) => (o.serviceId === serviceId ? { ...o, ...patch } : o)));
  }

  return (
    <ul className="service-offerings-editor">
      {SERVICES.map((service) => {
        const offering = offerings.find((o) => o.serviceId === service.id)
          ?? { serviceId: service.id, selected: false, durationMinutes: 60, priceCents: '' };
        return (
          <li key={service.id} className="service-offering-row">
            <label>
              <input
                type="checkbox"
                checked={offering.selected}
                onChange={(e) => update(service.id, { selected: e.target.checked })}
              />
              {service.label}
            </label>
            {offering.selected && (
              <span className="service-offering-fields">
                <label>
                  Minutes
                  <input
                    type="number" min="1" value={offering.durationMinutes}
                    aria-label={`${service.label} duration minutes`}
                    onChange={(e) => update(service.id, { durationMinutes: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Price $
                  <input
                    type="number" min="0" step="1" value={offering.priceCents === '' ? '' : offering.priceCents / 100}
                    aria-label={`${service.label} price dollars`}
                    onChange={(e) => update(service.id, {
                      priceCents: e.target.value === '' ? '' : Math.round(Number(e.target.value) * 100),
                    })}
                  />
                </label>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

> **Before writing:** open `apps/web/src/data/services.js` and confirm the export name is `SERVICES` and each item has `{ id, label }`. If the shape differs (e.g. `name` instead of `label`), adjust the field references here to match the real shape.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/groomer/ServiceOfferingsEditor.jsx
git commit -m "feat(groomer): add ServiceOfferingsEditor component"
```

---

## Task 6: OnboardingWizard + steps

**Files:**
- Create: `apps/web/src/groomer/onboarding/steps.jsx`
- Create: `apps/web/src/groomer/onboarding/OnboardingWizard.jsx`
- Test: `apps/web/src/groomer/onboarding/OnboardingWizard.test.jsx`

- [ ] **Step 1: Write the step components**

```jsx
// apps/web/src/groomer/onboarding/steps.jsx
import { AvailabilityEditor } from '../AvailabilityEditor.jsx';
import { ServiceOfferingsEditor } from '../ServiceOfferingsEditor.jsx';
import { suggestAddresses, resolvePlace } from '../../api/geocoding.js';
import { useState } from 'react';

export function StepBusiness({ form, set }) {
  return (
    <fieldset>
      <legend>Business basics</legend>
      <label>Business name
        <input value={form.name} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label>Phone
        <input value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
      </label>
      <label>Bio
        <textarea value={form.bio} onChange={(e) => set({ bio: e.target.value })} />
      </label>
    </fieldset>
  );
}

export function StepLocation({ form, set }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  async function onQueryChange(value) {
    setQuery(value);
    if (value.trim().length < 3) { setSuggestions([]); return; }
    try { setSuggestions(await suggestAddresses(value)); } catch { setSuggestions([]); }
  }

  async function pick(suggestion) {
    const place = await resolvePlace(suggestion);
    set({ address: place.displayName, lat: place.lat, lng: place.lng });
    setQuery(place.displayName);
    setSuggestions([]);
  }

  return (
    <fieldset>
      <legend>Location</legend>
      <div role="radiogroup" aria-label="Location mode">
        <label><input type="radio" name="mode" checked={form.locationMode === 'salon'}
          onChange={() => set({ locationMode: 'salon' })} /> Salon (clients come to me)</label>
        <label><input type="radio" name="mode" checked={form.locationMode === 'mobile'}
          onChange={() => set({ locationMode: 'mobile' })} /> Mobile (I travel to clients)</label>
      </div>
      <label>{form.locationMode === 'mobile' ? 'Base address / ZIP' : 'Salon address'}
        <input value={query} onChange={(e) => onQueryChange(e.target.value)} />
      </label>
      {suggestions.length > 0 && (
        <ul className="address-suggestions">
          {suggestions.map((s) => (
            <li key={s.placeId ?? s.displayName}>
              <button type="button" onClick={() => pick(s)}>{s.displayName}</button>
            </li>
          ))}
        </ul>
      )}
      {form.locationMode === 'mobile' && (
        <label>Service radius (miles)
          <input type="number" min="1" value={form.serviceRadiusMiles}
            onChange={(e) => set({ serviceRadiusMiles: Number(e.target.value) })} />
        </label>
      )}
    </fieldset>
  );
}

export function StepServices({ form, set }) {
  return (
    <fieldset>
      <legend>Services &amp; pricing</legend>
      <ServiceOfferingsEditor offerings={form.offerings} onChange={(offerings) => set({ offerings })} />
    </fieldset>
  );
}

export function StepAvailability({ form, set }) {
  return (
    <fieldset>
      <legend>Weekly availability</legend>
      <AvailabilityEditor blocks={form.availability} onChange={(availability) => set({ availability })} />
      <label>Minimum notice (hours)
        <input type="number" min="0" value={form.bookingLeadTimeHours}
          onChange={(e) => set({ bookingLeadTimeHours: Number(e.target.value) })} />
      </label>
    </fieldset>
  );
}

export function StepWaitlistExtras({ form, set }) {
  return (
    <fieldset>
      <legend>Waitlist &amp; extras</legend>
      <label>
        <input type="checkbox" checked={form.acceptsWaitlist}
          onChange={(e) => set({ acceptsWaitlist: e.target.checked })} />
        Accept waitlist requests (you have cancellation capacity)
      </label>
    </fieldset>
  );
}
```

> **Before writing:** confirm `apps/web/src/api/geocoding.js` exports `suggestAddresses` and `resolvePlace` with the `{ lat, lng, displayName }` / suggestion shapes (the deep-dive confirmed these exist). Adjust names if the real exports differ.

- [ ] **Step 2: Write the OnboardingWizard**

```jsx
// apps/web/src/groomer/onboarding/OnboardingWizard.jsx
import { useState } from 'react';
import {
  StepBusiness, StepLocation, StepServices, StepAvailability, StepWaitlistExtras,
} from './steps.jsx';
import {
  validateBusiness, validateLocation, validateServices, validateAvailability, isValid,
} from './validation.js';
import {
  createOwnedGroomer, saveOffering, saveAvailabilityBlock, setWaitlistOptIn,
} from '../../api/groomerOnboarding.js';

const MILES_TO_METERS = 1609.34;

const INITIAL_FORM = {
  name: '', phone: '', bio: '',
  locationMode: 'salon', address: '', lat: null, lng: null, serviceRadiusMiles: 10,
  offerings: [], availability: [], bookingLeadTimeHours: 2, acceptsWaitlist: false,
};

const STEPS = [
  { key: 'business', label: 'Business', Component: StepBusiness, validate: (f) => validateBusiness(f) },
  { key: 'location', label: 'Location', Component: StepLocation, validate: (f) => validateLocation(f) },
  { key: 'services', label: 'Services', Component: StepServices, validate: (f) => validateServices(f.offerings) },
  { key: 'availability', label: 'Availability', Component: StepAvailability, validate: (f) => validateAvailability(f.availability) },
  { key: 'extras', label: 'Waitlist', Component: StepWaitlistExtras, validate: () => ({}) },
];

export function OnboardingWizard({ onComplete }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const step = STEPS[stepIndex];
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  function next() {
    const stepErrors = step.validate(form);
    setErrors(stepErrors);
    if (!isValid(stepErrors)) return;
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1);
    else submit();
  }

  function back() {
    setErrors({});
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError('');
    try {
      const groomer = await createOwnedGroomer({
        name: form.name, locationMode: form.locationMode,
        address: form.locationMode === 'salon' ? form.address : null,
        lat: form.lat, lng: form.lng,
        serviceRadiusMeters: form.locationMode === 'mobile'
          ? Math.round(form.serviceRadiusMiles * MILES_TO_METERS) : null,
        timezone: 'America/New_York', phone: form.phone, bio: form.bio,
      });
      for (const o of form.offerings.filter((x) => x.selected)) {
        await saveOffering({
          groomerId: groomer.id, serviceId: o.serviceId,
          durationMinutes: o.durationMinutes, priceCents: Number(o.priceCents),
        });
      }
      for (const b of form.availability) {
        await saveAvailabilityBlock({
          groomerId: groomer.id, weekday: b.weekday, startTime: b.startTime, endTime: b.endTime,
        });
      }
      if (form.acceptsWaitlist) {
        await setWaitlistOptIn({ groomerId: groomer.id, accepts: true });
      }
      onComplete?.(groomer);
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  const StepComponent = step.Component;
  return (
    <section className="onboarding-wizard" aria-label="Groomer onboarding">
      <ol className="onboarding-progress">
        {STEPS.map((s, i) => (
          <li key={s.key} aria-current={i === stepIndex ? 'step' : undefined}>{s.label}</li>
        ))}
      </ol>
      <StepComponent form={form} set={set} />
      {Object.values(errors).map((message) => (
        <p key={message} className="field-error" role="alert">{message}</p>
      ))}
      {submitError && <p className="field-error" role="alert">{submitError}</p>}
      <div className="onboarding-nav">
        {stepIndex > 0 && <button type="button" onClick={back} disabled={submitting}>Back</button>}
        <button type="button" onClick={next} disabled={submitting}>
          {stepIndex === STEPS.length - 1 ? (submitting ? 'Creating…' : 'Finish') : 'Next'}
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Write the navigation/gating test**

```jsx
// apps/web/src/groomer/onboarding/OnboardingWizard.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../api/geocoding.js', () => ({
  suggestAddresses: vi.fn().mockResolvedValue([]),
  resolvePlace: vi.fn(),
}));
const onboarding = {
  createOwnedGroomer: vi.fn(),
  saveOffering: vi.fn(),
  saveAvailabilityBlock: vi.fn(),
  setWaitlistOptIn: vi.fn(),
};
vi.mock('../../api/groomerOnboarding.js', () => onboarding);

import { OnboardingWizard } from './OnboardingWizard.jsx';

beforeEach(() => { Object.values(onboarding).forEach((fn) => fn.mockReset()); });

it('blocks advancing past step 1 with an empty business name', () => {
  render(<OnboardingWizard />);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Business name is required.')).toBeInTheDocument();
  // still on the Business step (its legend is visible)
  expect(screen.getByText('Business basics')).toBeInTheDocument();
});

it('advances to the Location step once a name is entered', () => {
  render(<OnboardingWizard />);
  fireEvent.change(screen.getByLabelText('Business name'), { target: { value: 'Paws' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Location')).toBeInTheDocument();
  expect(screen.getByRole('radiogroup', { name: 'Location mode' })).toBeInTheDocument();
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @paw-status/web -- OnboardingWizard`
Expected: PASS (2 tests). (Steps 1–2 written, then this verifies.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/groomer/onboarding/
git commit -m "feat(groomer): add onboarding wizard and steps"
```

---

## Task 7: Wire the wizard into StaffDashboard + LoginPanel intent

**Files:**
- Modify: `apps/web/src/groomer/StaffDashboard.jsx`
- Modify: `apps/web/src/auth/LoginPanel.jsx`

> **Read both files first.** `StaffDashboard` already loads the groomer workspace (memberships) via `loadGroomerWorkspaceForVerifiedUser`. The change: when the signed-in user has a `groomer_account` but **no verified membership**, render `OnboardingWizard`; on completion, reload the workspace so the dashboard appears.

- [ ] **Step 1: Branch StaffDashboard to the wizard**

In `StaffDashboard.jsx`, import the wizard and add the branch where the workspace is resolved. Concretely:

```jsx
import { OnboardingWizard } from './onboarding/OnboardingWizard.jsx';
```

Inside the component, after the workspace has loaded, compute whether a verified membership exists and branch. Use the workspace shape already returned by `loadGroomerWorkspaceForVerifiedUser` (an object with `memberships`):

```jsx
  const hasVerifiedMembership = Boolean(
    workspace?.memberships?.some((m) => m.status === 'verified'),
  );

  if (account && !hasVerifiedMembership) {
    return (
      <OnboardingWizard
        onComplete={() => {
          // re-run the workspace loader so the dashboard renders with the new groomer
          reloadWorkspace();
        }}
      />
    );
  }
```

> Match `account`, `workspace`, and the reload trigger to the actual variable/effect names in the file. If the dashboard re-loads via a `refreshTick` counter (the deep-dive noted a `refreshTick` pattern), call its setter instead of a `reloadWorkspace` function — e.g. `setRefreshTick((n) => n + 1)`.

- [ ] **Step 2: Add the "I'm a groomer" intent to LoginPanel**

In `LoginPanel.jsx`, add a link/button below the auth form that navigates to `/groomer` so a groomer lands on the onboarding surface after signing in:

```jsx
  <p className="auth-intent">
    Are you a groomer?{' '}
    <button
      type="button"
      className="link-button"
      onClick={() => {
        window.history.pushState(null, '', '/groomer');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }}
    >
      Set up your groomer profile
    </button>
  </p>
```

> This reuses the app's existing hand-rolled routing (`pushState` + `popstate`, per `App.jsx`). It does not change the auth mechanism — password-first signup already works through the shared `AuthProvider`.

- [ ] **Step 3: Verify build + existing tests still pass**

Run: `npm run build`
Expected: succeeds.

Run: `npm test --workspace @paw-status/web -- StaffDashboard LoginPanel`
Expected: existing tests still PASS (update any snapshot/assertion the branch legitimately changes).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/groomer/StaffDashboard.jsx apps/web/src/auth/LoginPanel.jsx
git commit -m "feat(groomer): route un-onboarded groomers to the wizard"
```

---

## CHECKPOINT — Phase 2 complete

Manual verification (dev server + hosted Supabase):
- [ ] `npm test` green; `npm run build` succeeds; `git diff --check` clean.
- [ ] Sign up password-first, click "Set up your groomer profile", create a `groomer_account` (existing dashboard form), then complete the wizard.
- [ ] In Supabase: a `groomers` row exists with `owner_account_id` set, a `groomer_memberships` row with `status='verified'`, matching `groomer_service_offerings` + `groomer_availability` rows, and `groomers.services` reflecting the chosen services.
- [ ] `curl /api/availability?groomerId=<new id>&serviceId=<chosen>&from=...&to=...` (Phase 1) now returns real slots for the just-onboarded groomer.

**Deliverable:** a groomer can self-onboard into a bookable business. Phase 3 (booking) consumes these offerings/availability via the Phase 1 engine.
