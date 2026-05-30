# ShinyPawz Phase 3 — Booking Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The core demo loop — a customer picks a real slot and submits a request; the groomer Accepts (atomic confirmation with double-booking safety) or Declines; both sides get live in-app notifications.

**Architecture:** Booking *mutations* are client-callable `SECURITY DEFINER` RPCs (`confirm_appointment_request`, `decline_appointment_request`, `cancel_appointment`) — they verify authorization, insert the `appointments` row (the Phase 1 GIST exclusion constraint guarantees no overlap), and write notifications atomically. Request *creation* stays a plain RLS insert; an `AFTER INSERT` trigger notifies the groomer. Notifications stream to the browser via a Supabase Realtime subscription powering a `NotificationBell`.

**Tech Stack:** Supabase Postgres (`SECURITY DEFINER` RPCs, triggers, Realtime), React 18 (JSX), Vitest + Testing Library. **npm only.**

**Depends on:** Phase 1 (appointments columns + GIST constraint, `fetchAvailableSlots`, the engine) and Phase 2 (offerings/availability so slots exist; verified memberships).

**Spec:** `docs/superpowers/specs/2026-05-29-shinypawz-demo-ready-design.md` (§5.2 notifications, §7 RPCs, §10 Flows 2–3, §11, §13, §17 Phase 3).

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/*_add_notifications_and_booking_rpcs.sql` | `notifications` + RLS, `app_private.notify`, request→groomer trigger, confirm/decline/cancel RPCs, groomer SELECT policy on `appointments`. |
| `apps/web/src/api/appointments.js` | `createSlotBookingRequest`, `confirmRequest`, `declineRequest`, `cancelAppointment`, `loadGroomerRequests`, `loadCustomerAppointments`. |
| `apps/web/src/api/appointments.test.js` | Tests (mock supabase). |
| `apps/web/src/api/notifications.js` | `loadNotifications`, `markNotificationRead`, `subscribeNotifications`. |
| `apps/web/src/api/notifications.test.js` | Tests. |
| `apps/web/src/customer/SlotPicker.jsx` | Loads + renders bookable slots; `onPick(slot)`. |
| `apps/web/src/customer/SlotPicker.test.jsx` | Component test. |
| `apps/web/src/customer/GroomerDetailPanel.jsx` | Offerings + `SlotPicker` + submit request. |
| `apps/web/src/groomer/RequestActions.jsx` | Accept/Decline buttons (calls RPCs, handles `slot_taken`). |
| `apps/web/src/groomer/RequestActions.test.jsx` | Component test. |
| `apps/web/src/groomer/StaffDashboard.jsx` (modify) | Requests tab renders `RequestActions`. |
| `apps/web/src/layout/NotificationBell.jsx` | Realtime feed + unread badge + mark-read. |
| `apps/web/src/layout/NotificationBell.test.jsx` | Component test. |
| `apps/web/src/layout/AppShell.jsx` (modify) | Mount `NotificationBell` in the top bar. |

---

## Task 1: Notifications table + booking RPCs migration

**Files:**
- Create: `supabase/migrations/<timestamp>_add_notifications_and_booking_rpcs.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 1. Notifications feed --------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_auth_user_id uuid not null,
  kind text not null check (kind in (
    'booking_requested','booking_confirmed','booking_declined',
    'waitlist_offer','waitlist_claimed','appointment_cancelled')),
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_recipient_idx
  on public.notifications (recipient_auth_user_id, created_at desc);

alter table public.notifications enable row level security;

-- Recipients read and update (mark-read) only their own notifications. No client INSERT.
create policy "recipient reads own notifications" on public.notifications
  for select using (recipient_auth_user_id = (select auth.uid()));
create policy "recipient updates own notifications" on public.notifications
  for update using (recipient_auth_user_id = (select auth.uid()))
  with check (recipient_auth_user_id = (select auth.uid()));

-- 2. Private notify helper -----------------------------------------------------
create or replace function app_private.notify(
  p_recipient uuid, p_kind text, p_title text, p_body text, p_data jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_recipient is null then return; end if;
  insert into public.notifications (recipient_auth_user_id, kind, title, body, data)
  values (p_recipient, p_kind, p_title, p_body, coalesce(p_data, '{}'::jsonb));
end; $$;

-- 3. Notify groomer when a request is created ---------------------------------
create or replace function app_private.notify_groomer_on_request()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select ga.auth_user_id into v_owner
  from public.groomers g
  join public.groomer_accounts ga on ga.id = g.owner_account_id
  where g.id = new.groomer_id;
  perform app_private.notify(v_owner, 'booking_requested', 'New booking request',
    'A customer requested an appointment.',
    jsonb_build_object('requestId', new.id, 'groomerId', new.groomer_id));
  return new;
end; $$;

drop trigger if exists notify_groomer_on_request on public.appointment_requests;
create trigger notify_groomer_on_request
  after insert on public.appointment_requests
  for each row execute function app_private.notify_groomer_on_request();

-- 4. Groomers can read appointments for their groomer ---------------------------
drop policy if exists "verified groomer reads appointments" on public.appointments;
create policy "verified groomer reads appointments" on public.appointments
  for select using (app_private.current_user_verified_for_groomer(groomer_id));

-- 5. Confirm (atomic) ----------------------------------------------------------
create or replace function public.confirm_appointment_request(
  p_request_id uuid, p_slot_at timestamptz default null
) returns public.appointments
language plpgsql security definer set search_path = public, auth as $$
declare
  v_req public.appointment_requests;
  v_offering public.groomer_service_offerings;
  v_customer public.customers;
  v_slot timestamptz;
  v_appt public.appointments;
begin
  select * into v_req from public.appointment_requests where id = p_request_id;
  if v_req.id is null then raise exception 'Request not found.' using errcode = 'P0002'; end if;
  if not app_private.current_user_verified_for_groomer(v_req.groomer_id) then
    raise exception 'Not authorized for this groomer.' using errcode = '42501';
  end if;

  v_slot := coalesce(p_slot_at, v_req.requested_slot_at);
  if v_slot is null then raise exception 'No slot was selected.' using errcode = '22023'; end if;

  select * into v_offering from public.groomer_service_offerings
  where groomer_id = v_req.groomer_id and service_id = v_req.service_id and is_active;

  begin
    insert into public.appointments (
      dog_id, groomer_id, customer_id, appointment_request_id, service, service_id,
      scheduled_at, duration_minutes, price_cents, status
    ) values (
      v_req.dog_id, v_req.groomer_id, v_req.customer_id, v_req.id, v_req.service, v_req.service_id,
      v_slot, coalesce(v_offering.duration_minutes, v_req.requested_duration_minutes, 60),
      v_offering.price_cents, 'booked'
    ) returning * into v_appt;
  exception when exclusion_violation then
    raise exception 'That time was just booked. Pick another slot.' using errcode = '23P01';
  end;

  update public.appointment_requests set status = 'confirmed', updated_at = now() where id = v_req.id;

  select * into v_customer from public.customers where id = v_req.customer_id;
  perform app_private.notify(v_customer.auth_user_id, 'booking_confirmed', 'Booking confirmed',
    'Your grooming appointment is confirmed.',
    jsonb_build_object('appointmentId', v_appt.id, 'groomerId', v_req.groomer_id, 'slotAt', v_slot));

  return v_appt;
end; $$;

-- 6. Decline -------------------------------------------------------------------
create or replace function public.decline_appointment_request(
  p_request_id uuid, p_note text default null
) returns public.appointment_requests
language plpgsql security definer set search_path = public, auth as $$
declare v_req public.appointment_requests; v_customer public.customers;
begin
  select * into v_req from public.appointment_requests where id = p_request_id;
  if v_req.id is null then raise exception 'Request not found.' using errcode = 'P0002'; end if;
  if not app_private.current_user_verified_for_groomer(v_req.groomer_id) then
    raise exception 'Not authorized for this groomer.' using errcode = '42501';
  end if;

  update public.appointment_requests
  set status = 'declined', customer_notes = coalesce(p_note, customer_notes), updated_at = now()
  where id = v_req.id returning * into v_req;

  select * into v_customer from public.customers where id = v_req.customer_id;
  perform app_private.notify(v_customer.auth_user_id, 'booking_declined', 'Request declined',
    coalesce(p_note, 'The groomer could not take this request.'),
    jsonb_build_object('requestId', v_req.id, 'groomerId', v_req.groomer_id));

  return v_req;
end; $$;

-- 7. Cancel (Plan 4 REPLACES this to add waitlist backfill) --------------------
create or replace function public.cancel_appointment(
  p_appointment_id uuid, p_reason text default null
) returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_appt public.appointments; v_customer public.customers; v_owner uuid; v_is_customer boolean;
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
    select ga.auth_user_id into v_owner
    from public.groomers g join public.groomer_accounts ga on ga.id = g.owner_account_id
    where g.id = v_appt.groomer_id;
    perform app_private.notify(v_owner, 'appointment_cancelled', 'Appointment cancelled',
      'A customer cancelled an appointment.', jsonb_build_object('appointmentId', v_appt.id));
  else
    perform app_private.notify(v_customer.auth_user_id, 'appointment_cancelled', 'Appointment cancelled',
      'Your groomer cancelled an appointment.', jsonb_build_object('appointmentId', v_appt.id));
  end if;
end; $$;

-- Grants
revoke all on function public.confirm_appointment_request(uuid, timestamptz) from public;
revoke all on function public.decline_appointment_request(uuid, text) from public;
revoke all on function public.cancel_appointment(uuid, text) from public;
grant execute on function public.confirm_appointment_request(uuid, timestamptz) to authenticated;
grant execute on function public.decline_appointment_request(uuid, text) to authenticated;
grant execute on function public.cancel_appointment(uuid, text) to authenticated;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: success.

- [ ] **Step 3: Verify objects exist**

```sql
select proname from pg_proc
where proname in ('confirm_appointment_request','decline_appointment_request','cancel_appointment','notify');
select tgname from pg_trigger where tgname = 'notify_groomer_on_request';
```

Expected: 4 function rows + 1 trigger row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/*_add_notifications_and_booking_rpcs.sql
git commit -m "feat(db): add notifications + booking lifecycle RPCs"
```

---

## Task 2: appointments api module

**Files:**
- Create: `apps/web/src/api/appointments.js`
- Test: `apps/web/src/api/appointments.test.js`

- [ ] **Step 1: Write the failing test**

```js
// apps/web/src/api/appointments.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();
vi.mock('../lib/supabaseClient.js', () => ({ requireSupabaseClient: () => ({ rpc, from }) }));

import {
  createSlotBookingRequest, confirmRequest, declineRequest, cancelAppointment,
} from './appointments.js';

beforeEach(() => { rpc.mockReset(); from.mockReset(); });

it('createSlotBookingRequest inserts a request with the chosen slot', async () => {
  const single = vi.fn().mockResolvedValue({ data: { id: 'r1' }, error: null });
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  from.mockReturnValue({ insert });

  const request = await createSlotBookingRequest({
    customerId: 'c1', dogId: 'd1', groomerId: 'g1', serviceId: 'full-groom',
    service: 'Full groom', requestedSlotAt: '2026-06-02T13:00:00.000Z',
    requestedDurationMinutes: 90, customerNotes: 'shy dog',
  });

  expect(from).toHaveBeenCalledWith('appointment_requests');
  expect(insert).toHaveBeenCalledWith({
    customer_id: 'c1', dog_id: 'd1', groomer_id: 'g1', service_id: 'full-groom',
    service: 'Full groom', requested_slot_at: '2026-06-02T13:00:00.000Z',
    requested_duration_minutes: 90, customer_notes: 'shy dog', status: 'requested',
  });
  expect(request).toEqual({ id: 'r1' });
});

it('confirmRequest calls the rpc and returns the appointment', async () => {
  rpc.mockResolvedValue({ data: { id: 'a1', status: 'booked' }, error: null });
  const appt = await confirmRequest({ requestId: 'r1', slotAt: '2026-06-02T13:00:00.000Z' });
  expect(rpc).toHaveBeenCalledWith('confirm_appointment_request', {
    p_request_id: 'r1', p_slot_at: '2026-06-02T13:00:00.000Z',
  });
  expect(appt).toEqual({ id: 'a1', status: 'booked' });
});

it('confirmRequest surfaces the slot_taken message', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'That time was just booked. Pick another slot.' } });
  await expect(confirmRequest({ requestId: 'r1' })).rejects.toThrow('That time was just booked. Pick another slot.');
});

it('declineRequest calls the rpc with a note', async () => {
  rpc.mockResolvedValue({ data: { id: 'r1', status: 'declined' }, error: null });
  await declineRequest({ requestId: 'r1', note: 'Fully booked that week' });
  expect(rpc).toHaveBeenCalledWith('decline_appointment_request', {
    p_request_id: 'r1', p_note: 'Fully booked that week',
  });
});

it('cancelAppointment calls the rpc', async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  await cancelAppointment({ appointmentId: 'a1', reason: 'sick' });
  expect(rpc).toHaveBeenCalledWith('cancel_appointment', { p_appointment_id: 'a1', p_reason: 'sick' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @paw-status/web -- src/api/appointments`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// apps/web/src/api/appointments.js
import { requireSupabaseClient } from '../lib/supabaseClient.js';

function unwrap({ data, error }, fallback) {
  if (error) throw new Error(error.message || fallback);
  return data;
}

export async function createSlotBookingRequest({
  customerId, dogId, groomerId, serviceId, service,
  requestedSlotAt, requestedDurationMinutes, customerNotes = null,
}) {
  const supabase = requireSupabaseClient();
  const result = await supabase
    .from('appointment_requests')
    .insert({
      customer_id: customerId, dog_id: dogId, groomer_id: groomerId,
      service_id: serviceId, service, requested_slot_at: requestedSlotAt,
      requested_duration_minutes: requestedDurationMinutes,
      customer_notes: customerNotes, status: 'requested',
    })
    .select()
    .single();
  return unwrap(result, 'Could not submit booking request.');
}

export async function confirmRequest({ requestId, slotAt = null }) {
  const supabase = requireSupabaseClient();
  const result = await supabase.rpc('confirm_appointment_request', {
    p_request_id: requestId, p_slot_at: slotAt,
  });
  return unwrap(result, 'Could not confirm the request.');
}

export async function declineRequest({ requestId, note = null }) {
  const supabase = requireSupabaseClient();
  const result = await supabase.rpc('decline_appointment_request', {
    p_request_id: requestId, p_note: note,
  });
  return unwrap(result, 'Could not decline the request.');
}

export async function cancelAppointment({ appointmentId, reason = null }) {
  const supabase = requireSupabaseClient();
  const result = await supabase.rpc('cancel_appointment', {
    p_appointment_id: appointmentId, p_reason: reason,
  });
  if (result.error) throw new Error(result.error.message || 'Could not cancel the appointment.');
}

export async function loadGroomerRequests({ groomerId }) {
  const supabase = requireSupabaseClient();
  const result = await supabase
    .from('appointment_requests')
    .select('id, dog_id, service, service_id, status, requested_slot_at, customer_notes, created_at')
    .eq('groomer_id', groomerId)
    .order('created_at', { ascending: false });
  return unwrap(result, 'Could not load requests.') ?? [];
}

export async function loadCustomerAppointments({ customerId }) {
  const supabase = requireSupabaseClient();
  const result = await supabase
    .from('appointments')
    .select('id, groomer_id, service, service_id, scheduled_at, duration_minutes, price_cents, status')
    .eq('customer_id', customerId)
    .order('scheduled_at', { ascending: true });
  return unwrap(result, 'Could not load appointments.') ?? [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @paw-status/web -- src/api/appointments`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/api/appointments.js apps/web/src/api/appointments.test.js
git commit -m "feat(api): add appointments + booking lifecycle data access"
```

---

## Task 3: notifications api module

**Files:**
- Create: `apps/web/src/api/notifications.js`
- Test: `apps/web/src/api/notifications.test.js`

- [ ] **Step 1: Write the failing test**

```js
// apps/web/src/api/notifications.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();
const channel = vi.fn();
const removeChannel = vi.fn();
vi.mock('../lib/supabaseClient.js', () => ({
  requireSupabaseClient: () => ({ from, channel, removeChannel }),
}));

import { loadNotifications, markNotificationRead, subscribeNotifications } from './notifications.js';

beforeEach(() => { from.mockReset(); channel.mockReset(); removeChannel.mockReset(); });

it('loadNotifications returns mapped rows newest-first', async () => {
  const limit = vi.fn().mockResolvedValue({
    data: [{ id: 'n1', kind: 'booking_confirmed', title: 'Confirmed', body: 'ok', data: {}, read_at: null, created_at: 't' }],
    error: null,
  });
  const order = vi.fn().mockReturnValue({ limit });
  const select = vi.fn().mockReturnValue({ order });
  from.mockReturnValue({ select });

  const rows = await loadNotifications();
  expect(from).toHaveBeenCalledWith('notifications');
  expect(rows[0]).toEqual({
    id: 'n1', kind: 'booking_confirmed', title: 'Confirmed', body: 'ok', data: {}, readAt: null, createdAt: 't',
  });
});

it('markNotificationRead updates read_at', async () => {
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq });
  from.mockReturnValue({ update });
  await markNotificationRead('n1');
  expect(update).toHaveBeenCalled();
  expect(eq).toHaveBeenCalledWith('id', 'n1');
});

it('subscribeNotifications wires a postgres_changes channel and returns an unsubscribe fn', () => {
  const subscribe = vi.fn();
  const on = vi.fn().mockReturnValue({ subscribe });
  const chan = { on };
  channel.mockReturnValue(chan);
  on.mockReturnValue({ subscribe: () => chan });

  const unsubscribe = subscribeNotifications('user-1', vi.fn());
  expect(channel).toHaveBeenCalledWith('notifications:user-1');
  expect(on).toHaveBeenCalledWith(
    'postgres_changes',
    expect.objectContaining({ event: 'INSERT', table: 'notifications', filter: 'recipient_auth_user_id=eq.user-1' }),
    expect.any(Function),
  );
  unsubscribe();
  expect(removeChannel).toHaveBeenCalledWith(chan);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @paw-status/web -- src/api/notifications`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// apps/web/src/api/notifications.js
import { requireSupabaseClient } from '../lib/supabaseClient.js';

export function mapNotificationRow(row) {
  return {
    id: row.id, kind: row.kind, title: row.title, body: row.body,
    data: row.data ?? {}, readAt: row.read_at, createdAt: row.created_at,
  };
}

export async function loadNotifications({ limit = 50 } = {}) {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from('notifications')
    .select('id, kind, title, body, data, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message || 'Could not load notifications.');
  return (data ?? []).map(mapNotificationRow);
}

export async function markNotificationRead(id) {
  const supabase = requireSupabaseClient();
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message || 'Could not update notification.');
}

/**
 * Subscribe to new notifications for an auth user. Returns an unsubscribe fn.
 */
export function subscribeNotifications(authUserId, onInsert) {
  const supabase = requireSupabaseClient();
  const chan = supabase
    .channel(`notifications:${authUserId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_auth_user_id=eq.${authUserId}` },
      (payload) => onInsert(mapNotificationRow(payload.new)),
    )
    .subscribe();
  return () => supabase.removeChannel(chan);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @paw-status/web -- src/api/notifications`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/api/notifications.js apps/web/src/api/notifications.test.js
git commit -m "feat(api): add notifications data access with realtime subscribe"
```

---

## Task 4: SlotPicker component

**Files:**
- Create: `apps/web/src/customer/SlotPicker.jsx`
- Test: `apps/web/src/customer/SlotPicker.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/web/src/customer/SlotPicker.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const fetchAvailableSlots = vi.fn();
vi.mock('../api/availability.js', () => ({ fetchAvailableSlots }));

import { SlotPicker } from './SlotPicker.jsx';

beforeEach(() => fetchAvailableSlots.mockReset());

it('renders fetched slots and calls onPick when one is clicked', async () => {
  fetchAvailableSlots.mockResolvedValue([
    { slotAt: '2026-06-02T13:00:00.000Z', durationMinutes: 60 },
    { slotAt: '2026-06-02T14:00:00.000Z', durationMinutes: 60 },
  ]);
  const onPick = vi.fn();
  render(<SlotPicker groomerId="g1" serviceId="full-groom" onPick={onPick} />);

  await waitFor(() => expect(fetchAvailableSlots).toHaveBeenCalled());
  const buttons = await screen.findAllByRole('button', { name: /:/ });
  expect(buttons.length).toBe(2);
  fireEvent.click(buttons[0]);
  expect(onPick).toHaveBeenCalledWith({ slotAt: '2026-06-02T13:00:00.000Z', durationMinutes: 60 });
});

it('shows an empty state when there are no slots', async () => {
  fetchAvailableSlots.mockResolvedValue([]);
  render(<SlotPicker groomerId="g1" serviceId="full-groom" onPick={vi.fn()} />);
  expect(await screen.findByText(/no open times/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @paw-status/web -- SlotPicker`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```jsx
// apps/web/src/customer/SlotPicker.jsx
import { useEffect, useState } from 'react';
import { fetchAvailableSlots } from '../api/availability.js';

const HORIZON_DAYS = 14;

function groupByDay(slots) {
  const groups = new Map();
  for (const slot of slots) {
    const day = new Intl.DateTimeFormat('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    }).format(new Date(slot.slotAt));
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(slot);
  }
  return [...groups.entries()];
}

function formatTime(iso) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export function SlotPicker({ groomerId, serviceId, onPick }) {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!groomerId || !serviceId) return undefined;
    let active = true;
    setLoading(true);
    setError('');
    const from = new Date().toISOString();
    const to = new Date(Date.now() + HORIZON_DAYS * 86_400_000).toISOString();
    fetchAvailableSlots({ groomerId, serviceId, from, to })
      .then((result) => { if (active) setSlots(result); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [groomerId, serviceId]);

  if (loading) return <p className="slot-picker-status">Loading times…</p>;
  if (error) return <p className="slot-picker-status field-error" role="alert">{error}</p>;
  if (slots.length === 0) return <p className="slot-picker-status">No open times in the next two weeks.</p>;

  return (
    <div className="slot-picker">
      {groupByDay(slots).map(([day, daySlots]) => (
        <div key={day} className="slot-picker-day">
          <h4>{day}</h4>
          <div className="slot-picker-times">
            {daySlots.map((slot) => (
              <button key={slot.slotAt} type="button" onClick={() => onPick(slot)}>
                {formatTime(slot.slotAt)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

> The test matches buttons by the regex `/:/` because formatted times like "9:00 AM" contain a colon; the empty-state copy contains "no open times".

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @paw-status/web -- SlotPicker`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/customer/SlotPicker.jsx apps/web/src/customer/SlotPicker.test.jsx
git commit -m "feat(customer): add SlotPicker availability grid"
```

---

## Task 5: RequestActions (Accept/Decline) + StaffDashboard wiring

**Files:**
- Create: `apps/web/src/groomer/RequestActions.jsx`
- Test: `apps/web/src/groomer/RequestActions.test.jsx`
- Modify: `apps/web/src/groomer/StaffDashboard.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/web/src/groomer/RequestActions.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const confirmRequest = vi.fn();
const declineRequest = vi.fn();
vi.mock('../api/appointments.js', () => ({ confirmRequest, declineRequest }));

import { RequestActions } from './RequestActions.jsx';

beforeEach(() => { confirmRequest.mockReset(); declineRequest.mockReset(); });

const request = { id: 'r1', requested_slot_at: '2026-06-02T13:00:00.000Z' };

it('confirms a request and notifies the parent', async () => {
  confirmRequest.mockResolvedValue({ id: 'a1' });
  const onChanged = vi.fn();
  render(<RequestActions request={request} onChanged={onChanged} />);
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
  await waitFor(() => expect(confirmRequest).toHaveBeenCalledWith({ requestId: 'r1', slotAt: '2026-06-02T13:00:00.000Z' }));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
});

it('shows the slot_taken error without throwing', async () => {
  confirmRequest.mockRejectedValue(new Error('That time was just booked. Pick another slot.'));
  render(<RequestActions request={request} onChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
  expect(await screen.findByText('That time was just booked. Pick another slot.')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @paw-status/web -- RequestActions`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```jsx
// apps/web/src/groomer/RequestActions.jsx
import { useState } from 'react';
import { confirmRequest, declineRequest } from '../api/appointments.js';

export function RequestActions({ request, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(action) {
    setBusy(true);
    setError('');
    try {
      await action();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="request-actions">
      <button
        type="button" disabled={busy}
        onClick={() => run(() => confirmRequest({ requestId: request.id, slotAt: request.requested_slot_at }))}
      >
        Accept
      </button>
      <button
        type="button" disabled={busy}
        onClick={() => run(() => declineRequest({ requestId: request.id }))}
      >
        Decline
      </button>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @paw-status/web -- RequestActions`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire into StaffDashboard**

**Read `StaffDashboard.jsx` first.** In the section that renders appointment requests (the deep-dive noted a `RequestPacket`/`RequestList` structure with a `refreshTick` counter), import and render `RequestActions` for each request, refreshing the list on change:

```jsx
import { RequestActions } from './RequestActions.jsx';
// ...inside the per-request row render:
<RequestActions request={request} onChanged={() => setRefreshTick((n) => n + 1)} />
```

> Match `request` and `setRefreshTick` to the actual names in the file. If the list uses a different refresh mechanism, call that instead so the row disappears/updates after Accept/Decline.

- [ ] **Step 6: Verify build + dashboard tests**

Run: `npm run build`
Expected: succeeds.

Run: `npm test --workspace @paw-status/web -- StaffDashboard`
Expected: existing tests PASS (adjust assertions the new buttons legitimately change).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/groomer/RequestActions.jsx apps/web/src/groomer/RequestActions.test.jsx apps/web/src/groomer/StaffDashboard.jsx
git commit -m "feat(groomer): accept/decline requests from the dashboard"
```

---

## Task 6: GroomerDetailPanel (customer booking surface)

**Files:**
- Create: `apps/web/src/customer/GroomerDetailPanel.jsx`
- Modify: the customer surface to open it (see Step 2)

> Renders a groomer's services (from the groomer row's `services`/offerings already loaded by `fetchNearbyGroomers`), lets the customer choose a service + a dog + a slot, and submits the request. Keep it presentational: the parent passes the `groomer`, the customer's `dogs`, and `customerId`.

- [ ] **Step 1: Write the component**

```jsx
// apps/web/src/customer/GroomerDetailPanel.jsx
import { useState } from 'react';
import { SlotPicker } from './SlotPicker.jsx';
import { SERVICES } from '../data/services.js';
import { createSlotBookingRequest } from '../api/appointments.js';

export function GroomerDetailPanel({ groomer, dogs, customerId, onBooked }) {
  const offered = (groomer.services ?? []);
  const [serviceId, setServiceId] = useState(offered[0] ?? '');
  const [dogId, setDogId] = useState(dogs[0]?.id ?? '');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function pickSlot(slot) {
    setError('');
    setStatus('');
    if (!dogId) { setError('Add a dog first.'); return; }
    try {
      const serviceLabel = SERVICES.find((s) => s.id === serviceId)?.label ?? serviceId;
      await createSlotBookingRequest({
        customerId, dogId, groomerId: groomer.id, serviceId, service: serviceLabel,
        requestedSlotAt: slot.slotAt, requestedDurationMinutes: slot.durationMinutes,
      });
      setStatus('Request sent! The groomer will confirm shortly.');
      onBooked?.();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="groomer-detail" aria-label={`Book with ${groomer.name}`}>
      <h3>{groomer.name}</h3>
      <label>Service
        <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
          {offered.map((id) => (
            <option key={id} value={id}>{SERVICES.find((s) => s.id === id)?.label ?? id}</option>
          ))}
        </select>
      </label>
      <label>Dog
        <select value={dogId} onChange={(e) => setDogId(e.target.value)}>
          {dogs.map((dog) => <option key={dog.id} value={dog.id}>{dog.name}</option>)}
        </select>
      </label>
      <SlotPicker groomerId={groomer.id} serviceId={serviceId} onPick={pickSlot} />
      {status && <p className="form-status" role="status">{status}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 2: Open the panel from the customer flow**

**Read `CustomerApp.jsx` and `GroomerCard.jsx` first.** `GroomerCard` already has a "Book" CTA (per recent commits). Route that CTA to set a `selectedGroomer` in `CustomerApp`, and render `GroomerDetailPanel` for the selected groomer, passing the customer's `dogs` and `customerId` (both already loaded in the customer surface). Use the existing `selectedGroomer` state if present; otherwise add:

```jsx
const [selectedGroomer, setSelectedGroomer] = useState(null);
// pass onBook={() => setSelectedGroomer(groomer)} to GroomerCard's CTA
// then render:
{selectedGroomer && (
  <GroomerDetailPanel
    groomer={selectedGroomer}
    dogs={dogs}
    customerId={customer?.id}
    onBooked={() => setSelectedGroomer(null)}
  />
)}
```

> Match `dogs`, `customer`, and the CTA wiring to the real names in `CustomerApp.jsx`. The existing sign-in-first booking gate (per recent commits) still applies — only render the panel for a signed-in customer with a `customer.id`.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/customer/GroomerDetailPanel.jsx apps/web/src/customer/CustomerApp.jsx apps/web/src/customer/GroomerCard.jsx
git commit -m "feat(customer): book a real slot via GroomerDetailPanel"
```

---

## Task 7: NotificationBell + AppShell

**Files:**
- Create: `apps/web/src/layout/NotificationBell.jsx`
- Test: `apps/web/src/layout/NotificationBell.test.jsx`
- Modify: `apps/web/src/layout/AppShell.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/web/src/layout/NotificationBell.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const loadNotifications = vi.fn();
const subscribeNotifications = vi.fn(() => () => {});
const markNotificationRead = vi.fn();
vi.mock('../api/notifications.js', () => ({ loadNotifications, subscribeNotifications, markNotificationRead }));

import { NotificationBell } from './NotificationBell.jsx';

beforeEach(() => {
  loadNotifications.mockReset(); subscribeNotifications.mockClear(); markNotificationRead.mockReset();
});

it('shows the unread count from loaded notifications', async () => {
  loadNotifications.mockResolvedValue([
    { id: 'n1', kind: 'booking_confirmed', title: 'Confirmed', readAt: null, createdAt: 't', data: {} },
    { id: 'n2', kind: 'booking_requested', title: 'New request', readAt: 't', createdAt: 't', data: {} },
  ]);
  render(<NotificationBell authUserId="user-1" />);
  expect(await screen.findByText('1')).toBeInTheDocument(); // one unread
  expect(subscribeNotifications).toHaveBeenCalledWith('user-1', expect.any(Function));
});

it('renders nothing actionable when there is no auth user', () => {
  render(<NotificationBell authUserId={null} />);
  expect(loadNotifications).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @paw-status/web -- NotificationBell`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```jsx
// apps/web/src/layout/NotificationBell.jsx
import { useEffect, useState } from 'react';
import { loadNotifications, subscribeNotifications, markNotificationRead } from '../api/notifications.js';

export function NotificationBell({ authUserId }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!authUserId) return undefined;
    let active = true;
    loadNotifications()
      .then((rows) => { if (active) setItems(rows); })
      .catch(() => { /* a notification feed failure should not break the app */ });
    const unsubscribe = subscribeNotifications(authUserId, (row) => {
      setItems((prev) => [row, ...prev]);
    });
    return () => { active = false; unsubscribe(); };
  }, [authUserId]);

  if (!authUserId) return null;

  const unread = items.filter((n) => !n.readAt).length;

  async function openAndMarkRead() {
    setOpen((prev) => !prev);
    const unreadIds = items.filter((n) => !n.readAt).map((n) => n.id);
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: 'now' })));
    for (const id of unreadIds) {
      try { await markNotificationRead(id); } catch { /* best-effort */ }
    }
  }

  return (
    <div className="notification-bell">
      <button type="button" aria-label="Notifications" onClick={openAndMarkRead}>
        🔔{unread > 0 && <span className="notification-badge">{unread}</span>}
      </button>
      {open && (
        <ul className="notification-list">
          {items.length === 0 && <li>No notifications yet.</li>}
          {items.map((n) => (
            <li key={n.id} className={n.readAt ? 'read' : 'unread'}>
              <strong>{n.title}</strong>
              {n.body && <span>{n.body}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @paw-status/web -- NotificationBell`
Expected: PASS (2 tests).

- [ ] **Step 5: Mount in AppShell**

**Read `AppShell.jsx` first.** It already shows the signed-in user's email + Sign-out in a top bar. Add the bell beside them, passing the auth user id from the auth context:

```jsx
import { NotificationBell } from './NotificationBell.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
// inside the top bar, where user info renders:
const { user } = useAuth();
// ...
<NotificationBell authUserId={user?.id ?? null} />
```

> Match the auth hook/import to the file's existing usage (the deep-dive confirmed `useAuth()` exposes `user`). If `AppShell` already imports the auth context, reuse it rather than importing twice.

- [ ] **Step 6: Verify build + AppShell tests**

Run: `npm run build`
Expected: succeeds.

Run: `npm test --workspace @paw-status/web -- AppShell`
Expected: existing tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/layout/NotificationBell.jsx apps/web/src/layout/NotificationBell.test.jsx apps/web/src/layout/AppShell.jsx
git commit -m "feat(layout): add realtime NotificationBell to the app shell"
```

---

## CHECKPOINT — Phase 3 complete (the core demo)

Manual verification (two browser profiles, dev server + hosted Supabase, with a Phase 2 onboarded groomer):
- [ ] `npm test` green; `npm run build` succeeds; `git diff --check` clean.
- [ ] **Enable Realtime** for the `notifications` table in the Supabase dashboard (Database → Replication) — required for the bell to stream.
- [ ] As a customer: open the groomer, pick a service + dog + a real slot, submit. The groomer's `NotificationBell` shows "New booking request" live.
- [ ] As the groomer: Accept the request → an `appointments` row is created, the request flips to `confirmed`, the slot disappears from `/api/availability`, and the customer's bell shows "Booking confirmed" live.
- [ ] Attempt to Accept a second request for the same slot → friendly "That time was just booked" (GIST constraint working).
- [ ] Decline a request → customer notified; Cancel a confirmed appointment → other party notified.

**Deliverable:** the end-to-end booking relationship works. Phase 4 (waitlist) reuses the engine + `cancel_appointment` (replacing it to add backfill); Phase 5 adds the mock deposit at confirmation.
