# ShinyPawz Phase 5 — Integrations (Mock) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Demonstrate the payment + external-integration seams without any real external calls — a mock Stripe deposit at confirmation, a mock Google Business Profile "connect," and a Square Booking adapter — all self-contained so nothing can fail on stage.

**Architecture:** For the **demo path**, the mock deposit and GBP connect are client-callable `SECURITY DEFINER` RPCs (`create_deposit_intent`, `connect_gbp`) that write `payment_intents` / `groomer_integrations` rows and instantly succeed — consistent with the Phase 3–4 mutation style, no token plumbing. For the **production seam**, `apps/api/src/integrations/stripe.js` and `square.js` are real adapter interfaces with in-memory fakes, unit-tested in isolation, documenting exactly where a real Stripe/Square call would go. The deposit is gated by the off-by-default `groomers.requires_deposit` flag.

**Tech Stack:** Supabase Postgres (`SECURITY DEFINER` RPCs, RLS), Node ESM adapters, React 18, Vitest. **npm only. No real Stripe/Square/Google keys.**

**Depends on:** Phase 1 (`groomers.requires_deposit`), Phase 3 (`appointments`, `app_private`), Phase 2 (`OnboardingWizard` StepWaitlistExtras for the GBP button).

**Spec:** `docs/superpowers/specs/2026-05-29-shinypawz-demo-ready-design.md` (§5.2 `payment_intents`/`groomer_integrations`, §10 Flows 5–6, §12, §17 Phase 5, §20 out-of-scope = real APIs).

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/*_add_payments_and_integrations.sql` | `payment_intents`, `groomer_integrations` + RLS, `create_deposit_intent`, `connect_gbp` RPCs. |
| `apps/api/src/integrations/stripe.js` | Documented Stripe adapter interface + in-memory fake. |
| `apps/api/src/integrations/stripe.test.js` | Adapter unit test. |
| `apps/api/src/integrations/square.js` | Documented Square adapter interface + in-memory fake. |
| `apps/api/src/integrations/square.test.js` | Adapter unit test. |
| `apps/web/src/api/payments.js` | `createDepositIntent`, `loadAppointmentPayment`. |
| `apps/web/src/api/payments.test.js` | Tests. |
| `apps/web/src/api/gbp.js` | `connectGbp`, `loadIntegrations`. |
| `apps/web/src/api/gbp.test.js` | Tests. |
| `apps/web/src/customer/DepositModal.jsx` | Mock card form → deposit. |
| `apps/web/src/customer/DepositModal.test.jsx` | Component test. |
| `apps/web/src/groomer/GbpConnectButton.jsx` | Connect GBP + connected badge. |
| `apps/web/src/groomer/GbpConnectButton.test.jsx` | Component test. |
| `apps/web/src/customer/BookingsListPanel.jsx` (modify) | "Pay deposit" CTA → `DepositModal`. |
| `apps/web/src/groomer/onboarding/steps.jsx` (modify) | Mount `GbpConnectButton` in StepWaitlistExtras. |

---

## Task 1: Payments + integrations migration

**Files:**
- Create: `supabase/migrations/<timestamp>_add_payments_and_integrations.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 1. Tables --------------------------------------------------------------------
create table if not exists public.payment_intents (
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
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payment_intents_appointment_idx on public.payment_intents (appointment_id);

create table if not exists public.groomer_integrations (
  id uuid primary key default gen_random_uuid(),
  groomer_id uuid not null references public.groomers(id) on delete cascade,
  provider text not null check (provider in ('google_business_profile','square','stripe')),
  status text not null default 'not_connected' check (status in ('not_connected','connected','error')),
  external_id text,
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  unique (groomer_id, provider)
);

-- 2. RLS -----------------------------------------------------------------------
alter table public.payment_intents enable row level security;
alter table public.groomer_integrations enable row level security;

create policy "customer reads own payment intents" on public.payment_intents
  for select
  using (customer_id in (select c.id from public.customers c where c.auth_user_id = (select auth.uid())));
-- No client INSERT/UPDATE: only the create_deposit_intent RPC writes payment_intents.

create policy "integrations are public" on public.groomer_integrations
  for select using (true);
-- No client INSERT/UPDATE: only the connect_gbp RPC writes groomer_integrations.

-- 3. Mock deposit (demo) -------------------------------------------------------
-- DEMO FAKE: records a succeeded deposit instantly. The real Stripe call lives in
-- apps/api/src/integrations/stripe.js (production seam).
create or replace function public.create_deposit_intent(p_appointment_id uuid)
returns public.payment_intents
language plpgsql security definer set search_path = public, auth as $$
declare v_appt public.appointments; v_customer public.customers; v_amount integer; v_intent public.payment_intents;
begin
  select * into v_appt from public.appointments where id = p_appointment_id;
  if v_appt.id is null then raise exception 'Appointment not found.' using errcode = 'P0002'; end if;
  select * into v_customer from public.customers where id = v_appt.customer_id;
  if v_customer.auth_user_id <> (select auth.uid()) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  v_amount := greatest(500, coalesce(v_appt.price_cents, 0) * 20 / 100);  -- 20% deposit, min $5
  insert into public.payment_intents (appointment_id, customer_id, kind, amount_cents, status, external_ref)
  values (p_appointment_id, v_customer.id, 'deposit', v_amount, 'succeeded',
          'pi_demo_' || left(p_appointment_id::text, 8))
  returning * into v_intent;
  return v_intent;
end; $$;

-- 4. Mock GBP connect (demo) ---------------------------------------------------
create or replace function public.connect_gbp(p_groomer_id uuid)
returns public.groomer_integrations
language plpgsql security definer set search_path = public, auth as $$
declare v_row public.groomer_integrations;
begin
  if not app_private.current_user_verified_for_groomer(p_groomer_id) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  insert into public.groomer_integrations (groomer_id, provider, status, external_id, metadata, connected_at)
  values (p_groomer_id, 'google_business_profile', 'connected',
          'gbp_demo_' || left(p_groomer_id::text, 8),
          jsonb_build_object('rating', 4.8, 'reviewCount', 127, 'verified', true), now())
  on conflict (groomer_id, provider) do update
    set status = 'connected', external_id = excluded.external_id,
        metadata = excluded.metadata, connected_at = now()
  returning * into v_row;
  return v_row;
end; $$;

-- Grants
revoke all on function public.create_deposit_intent(uuid) from public;
revoke all on function public.connect_gbp(uuid) from public;
grant execute on function public.create_deposit_intent(uuid) to authenticated;
grant execute on function public.connect_gbp(uuid) to authenticated;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: success.

- [ ] **Step 3: Verify**

```sql
select tablename from pg_tables where schemaname='public' and tablename in ('payment_intents','groomer_integrations');
select proname from pg_proc where proname in ('create_deposit_intent','connect_gbp');
```

Expected: 2 tables + 2 functions.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/*_add_payments_and_integrations.sql
git commit -m "feat(db): add mock payments + integrations tables and RPCs"
```

---

## Task 2: Stripe + Square adapters (production seams)

**Files:**
- Create: `apps/api/src/integrations/stripe.js`
- Test: `apps/api/src/integrations/stripe.test.js`
- Create: `apps/api/src/integrations/square.js`
- Test: `apps/api/src/integrations/square.test.js`

> These document where real integrations plug in. The demo wires the RPCs (Task 1); these adapters are exercised by their unit tests and ready for a real implementation to replace the `// PRODUCTION SEAM` body.

- [ ] **Step 1: Write the failing Stripe test**

```js
// apps/api/src/integrations/stripe.test.js
import { describe, it, expect, vi } from 'vitest';
import { createStripeAdapter } from './stripe.js';

it('createDepositIntent inserts a succeeded deposit and returns it', async () => {
  const single = vi.fn().mockResolvedValue({ data: { id: 'pi-row', status: 'succeeded' }, error: null });
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  const supabase = { from: vi.fn().mockReturnValue({ insert }) };

  const adapter = createStripeAdapter({ supabase });
  const intent = await adapter.createDepositIntent({ appointmentId: 'appt-1234', customerId: 'c1', amountCents: 1700 });

  expect(supabase.from).toHaveBeenCalledWith('payment_intents');
  expect(insert).toHaveBeenCalledWith({
    appointment_id: 'appt-1234', customer_id: 'c1', kind: 'deposit',
    amount_cents: 1700, status: 'succeeded', external_ref: 'pi_demo_appt-123',
  });
  expect(intent).toEqual({ id: 'pi-row', status: 'succeeded' });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npm test --workspace @paw-status/web -- integrations/stripe`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the Stripe adapter**

```js
// apps/api/src/integrations/stripe.js

/**
 * Stripe adapter. The DEMO uses the create_deposit_intent RPC; this is the
 * production seam — replace the body of createDepositIntent with a real
 * Stripe PaymentIntent creation + confirmation, then record the result.
 */
export function createStripeAdapter({ supabase }) {
  return {
    async createDepositIntent({ appointmentId, customerId, amountCents }) {
      // PRODUCTION SEAM: const pi = await stripe.paymentIntents.create({ amount: amountCents, ... });
      // DEMO FAKE: record a succeeded deposit with a deterministic reference.
      const externalRef = `pi_demo_${String(appointmentId).slice(0, 8)}`;
      const { data, error } = await supabase
        .from('payment_intents')
        .insert({
          appointment_id: appointmentId, customer_id: customerId, kind: 'deposit',
          amount_cents: amountCents, status: 'succeeded', external_ref: externalRef,
        })
        .select()
        .single();
      if (error) throw new Error(error.message || 'Could not create deposit intent.');
      return data;
    },
  };
}
```

- [ ] **Step 4: Run it (passes)**

Run: `npm test --workspace @paw-status/web -- integrations/stripe`
Expected: PASS (1 test).

- [ ] **Step 5: Write the failing Square test**

```js
// apps/api/src/integrations/square.test.js
import { describe, it, expect } from 'vitest';
import { createSquareAdapter } from './square.js';

it('pushBooking returns a deterministic external ref', async () => {
  const adapter = createSquareAdapter();
  const result = await adapter.pushBooking({ id: 'appt-9876ab' });
  expect(result).toEqual({ externalRef: 'sq_demo_appt-987', pushed: true });
});

it('syncAvailability is a no-op that reports ok', async () => {
  const adapter = createSquareAdapter();
  expect(await adapter.syncAvailability('g1')).toEqual({ ok: true });
});
```

- [ ] **Step 6: Write the Square adapter**

```js
// apps/api/src/integrations/square.js

/**
 * Square Booking adapter. DEMO is a no-op fake; the PRODUCTION SEAM is where a
 * real Square Bookings API call would push/sync.
 */
export function createSquareAdapter() {
  return {
    async pushBooking(appointment) {
      // PRODUCTION SEAM: await squareClient.bookingsApi.createBooking({ ... });
      return { externalRef: `sq_demo_${String(appointment.id).slice(0, 8)}`, pushed: true };
    },
    async syncAvailability() {
      // PRODUCTION SEAM: pull/push availability with Square.
      return { ok: true };
    },
  };
}
```

- [ ] **Step 7: Run Square test (passes)**

Run: `npm test --workspace @paw-status/web -- integrations/square`
Expected: PASS (2 tests).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/integrations/stripe.js apps/api/src/integrations/stripe.test.js apps/api/src/integrations/square.js apps/api/src/integrations/square.test.js
git commit -m "feat(integrations): add Stripe + Square adapter seams with fakes"
```

---

## Task 3: payments + gbp api modules

**Files:**
- Create: `apps/web/src/api/payments.js`, `apps/web/src/api/payments.test.js`
- Create: `apps/web/src/api/gbp.js`, `apps/web/src/api/gbp.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// apps/web/src/api/payments.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
const rpc = vi.fn();
const from = vi.fn();
vi.mock('../lib/supabaseClient.js', () => ({ requireSupabaseClient: () => ({ rpc, from }) }));
import { createDepositIntent } from './payments.js';
beforeEach(() => { rpc.mockReset(); from.mockReset(); });

it('createDepositIntent calls the rpc and returns the intent', async () => {
  rpc.mockResolvedValue({ data: { id: 'pi1', status: 'succeeded', amount_cents: 1700 }, error: null });
  const intent = await createDepositIntent({ appointmentId: 'a1' });
  expect(rpc).toHaveBeenCalledWith('create_deposit_intent', { p_appointment_id: 'a1' });
  expect(intent).toEqual({ id: 'pi1', status: 'succeeded', amountCents: 1700 });
});
```

```js
// apps/web/src/api/gbp.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
const rpc = vi.fn();
const from = vi.fn();
vi.mock('../lib/supabaseClient.js', () => ({ requireSupabaseClient: () => ({ rpc, from }) }));
import { connectGbp, loadIntegrations } from './gbp.js';
beforeEach(() => { rpc.mockReset(); from.mockReset(); });

it('connectGbp calls the rpc', async () => {
  rpc.mockResolvedValue({ data: { id: 'gi1', status: 'connected' }, error: null });
  const row = await connectGbp({ groomerId: 'g1' });
  expect(rpc).toHaveBeenCalledWith('connect_gbp', { p_groomer_id: 'g1' });
  expect(row).toEqual({ id: 'gi1', status: 'connected' });
});

it('loadIntegrations returns rows for a groomer', async () => {
  const eq = vi.fn().mockResolvedValue({ data: [{ provider: 'google_business_profile', status: 'connected' }], error: null });
  const select = vi.fn().mockReturnValue({ eq });
  from.mockReturnValue({ select });
  const rows = await loadIntegrations({ groomerId: 'g1' });
  expect(from).toHaveBeenCalledWith('groomer_integrations');
  expect(rows).toEqual([{ provider: 'google_business_profile', status: 'connected' }]);
});
```

- [ ] **Step 2: Run them (fail)**

Run: `npm test --workspace @paw-status/web -- "src/api/payments" "src/api/gbp"`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

```js
// apps/web/src/api/payments.js
import { requireSupabaseClient } from '../lib/supabaseClient.js';

function mapIntent(row) {
  return {
    id: row.id, status: row.status, amountCents: row.amount_cents,
    kind: row.kind, externalRef: row.external_ref,
  };
}

export async function createDepositIntent({ appointmentId }) {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.rpc('create_deposit_intent', { p_appointment_id: appointmentId });
  if (error) throw new Error(error.message || 'Could not start the deposit.');
  return mapIntent(data);
}

export async function loadAppointmentPayment({ appointmentId }) {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from('payment_intents')
    .select('id, status, amount_cents, kind, external_ref')
    .eq('appointment_id', appointmentId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message || 'Could not load payment.');
  return (data && data[0]) ? mapIntent(data[0]) : null;
}
```

```js
// apps/web/src/api/gbp.js
import { requireSupabaseClient } from '../lib/supabaseClient.js';

export async function connectGbp({ groomerId }) {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.rpc('connect_gbp', { p_groomer_id: groomerId });
  if (error) throw new Error(error.message || 'Could not connect Google Business Profile.');
  return data;
}

export async function loadIntegrations({ groomerId }) {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from('groomer_integrations')
    .select('provider, status, external_id, metadata, connected_at')
    .eq('groomer_id', groomerId);
  if (error) throw new Error(error.message || 'Could not load integrations.');
  return data ?? [];
}
```

- [ ] **Step 4: Run them (pass)**

Run: `npm test --workspace @paw-status/web -- "src/api/payments" "src/api/gbp"`
Expected: PASS (3 tests total).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/api/payments.js apps/web/src/api/payments.test.js apps/web/src/api/gbp.js apps/web/src/api/gbp.test.js
git commit -m "feat(api): add mock payments + gbp data access"
```

---

## Task 4: DepositModal + BookingsListPanel CTA

**Files:**
- Create: `apps/web/src/customer/DepositModal.jsx`
- Test: `apps/web/src/customer/DepositModal.test.jsx`
- Modify: `apps/web/src/customer/BookingsListPanel.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/web/src/customer/DepositModal.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const createDepositIntent = vi.fn();
vi.mock('../api/payments.js', () => ({ createDepositIntent }));

import { DepositModal } from './DepositModal.jsx';

beforeEach(() => createDepositIntent.mockReset());

it('pays the deposit and notifies the parent', async () => {
  createDepositIntent.mockResolvedValue({ id: 'pi1', status: 'succeeded', amountCents: 1700 });
  const onPaid = vi.fn();
  render(<DepositModal appointmentId="a1" onPaid={onPaid} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /pay deposit/i }));
  await waitFor(() => expect(createDepositIntent).toHaveBeenCalledWith({ appointmentId: 'a1' }));
  await waitFor(() => expect(onPaid).toHaveBeenCalledWith({ id: 'pi1', status: 'succeeded', amountCents: 1700 }));
});

it('shows an error if the deposit fails', async () => {
  createDepositIntent.mockRejectedValue(new Error('Not authorized.'));
  render(<DepositModal appointmentId="a1" onPaid={vi.fn()} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /pay deposit/i }));
  expect(await screen.findByText('Not authorized.')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npm test --workspace @paw-status/web -- DepositModal`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```jsx
// apps/web/src/customer/DepositModal.jsx
import { useState } from 'react';
import { createDepositIntent } from '../api/payments.js';

// Mock card form — no real card data is collected or sent.
export function DepositModal({ appointmentId, onPaid, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pay() {
    setBusy(true);
    setError('');
    try {
      const intent = await createDepositIntent({ appointmentId });
      onPaid?.(intent);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="deposit-modal" role="dialog" aria-label="Pay deposit">
      <div className="deposit-modal-card">
        <h3>Secure your appointment</h3>
        <p className="deposit-demo-note">Demo payment — no real card is charged.</p>
        <input aria-label="Card number" placeholder="4242 4242 4242 4242" disabled />
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="deposit-modal-actions">
          <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" onClick={pay} disabled={busy}>
            {busy ? 'Processing…' : 'Pay deposit'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run it (passes)**

Run: `npm test --workspace @paw-status/web -- DepositModal`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the "Pay deposit" CTA into BookingsListPanel**

**Read `BookingsListPanel.jsx`.** For confirmed appointments, show a "Pay deposit" button that opens `DepositModal`. Track which appointment's modal is open with local state:

```jsx
import { useState } from 'react';
import { DepositModal } from './DepositModal.jsx';
// ...inside the component:
const [depositFor, setDepositFor] = useState(null);
// ...for a confirmed appointment row, render:
<button type="button" onClick={() => setDepositFor(appointment.id)}>Pay deposit</button>
// ...once, near the end of the returned JSX:
{depositFor && (
  <DepositModal
    appointmentId={depositFor}
    onPaid={() => setDepositFor(null)}
    onClose={() => setDepositFor(null)}
  />
)}
```

> The deposit is optional in the demo (the `requires_deposit` flag is off by default). Showing the CTA on confirmed appointments is sufficient to demo the flow; gating it on the groomer's `requires_deposit` is an optional refinement (join that field into `loadCustomerAppointments`).

- [ ] **Step 6: Verify build + bookings tests**

Run: `npm run build`
Expected: succeeds.

Run: `npm test --workspace @paw-status/web -- BookingsListPanel`
Expected: existing tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/customer/DepositModal.jsx apps/web/src/customer/DepositModal.test.jsx apps/web/src/customer/BookingsListPanel.jsx
git commit -m "feat(customer): add mock deposit modal at confirmation"
```

---

## Task 5: GbpConnectButton + onboarding wiring

**Files:**
- Create: `apps/web/src/groomer/GbpConnectButton.jsx`
- Test: `apps/web/src/groomer/GbpConnectButton.test.jsx`
- Modify: `apps/web/src/groomer/onboarding/steps.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/web/src/groomer/GbpConnectButton.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const connectGbp = vi.fn();
vi.mock('../api/gbp.js', () => ({ connectGbp }));

import { GbpConnectButton } from './GbpConnectButton.jsx';

beforeEach(() => connectGbp.mockReset());

it('connects GBP and shows the connected badge', async () => {
  connectGbp.mockResolvedValue({ status: 'connected' });
  render(<GbpConnectButton groomerId="g1" />);
  fireEvent.click(screen.getByRole('button', { name: /connect google business profile/i }));
  await waitFor(() => expect(connectGbp).toHaveBeenCalledWith({ groomerId: 'g1' }));
  expect(await screen.findByText(/google-verified/i)).toBeInTheDocument();
});

it('is disabled (no groomer yet) when groomerId is missing', () => {
  render(<GbpConnectButton groomerId={null} />);
  expect(screen.getByRole('button', { name: /connect google business profile/i })).toBeDisabled();
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npm test --workspace @paw-status/web -- GbpConnectButton`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```jsx
// apps/web/src/groomer/GbpConnectButton.jsx
import { useState } from 'react';
import { connectGbp } from '../api/gbp.js';

export function GbpConnectButton({ groomerId, initialConnected = false }) {
  const [connected, setConnected] = useState(initialConnected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function connect() {
    setBusy(true);
    setError('');
    try {
      const row = await connectGbp({ groomerId });
      setConnected(row.status === 'connected');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gbp-connect">
      <button type="button" onClick={connect} disabled={busy || !groomerId}>
        {busy ? 'Connecting…' : 'Connect Google Business Profile'}
      </button>
      {connected && <span className="gbp-badge">✓ Google-verified</span>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run it (passes)**

Run: `npm test --workspace @paw-status/web -- GbpConnectButton`
Expected: PASS (2 tests).

- [ ] **Step 5: Mount in onboarding StepWaitlistExtras**

In `apps/web/src/groomer/onboarding/steps.jsx`, the `StepWaitlistExtras` component receives `form`/`set`. The GBP button needs the created `groomer_id`, which exists only after Step 1's `create_owned_groomer`. Pass the created groomer id down from the wizard.

In `OnboardingWizard.jsx`, the groomer is created on `submit` (last step). For an in-wizard GBP connect, persist the created groomer id when Step 1 completes instead of only at the end. **Simplest demo-correct approach:** keep GBP out of the wizard and surface `GbpConnectButton` in the **dashboard** after onboarding, where the verified `groomerId` is known. Add to `StepWaitlistExtras` only a note:

```jsx
// in steps.jsx StepWaitlistExtras, add below the waitlist checkbox:
<p className="gbp-hint">You can connect your Google Business Profile from your dashboard after setup.</p>
```

Then render `GbpConnectButton` where the dashboard knows the verified groomer id (the same place `WaitlistInbox` is mounted in `StaffDashboard.jsx`):

```jsx
import { GbpConnectButton } from './GbpConnectButton.jsx';
// near the dashboard settings/header:
<GbpConnectButton groomerId={groomerId} />
```

> This avoids threading a half-created groomer id through the wizard. Match `groomerId` to the verified membership id already available in `StaffDashboard`.

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: succeeds.

Run: `npm test --workspace @paw-status/web -- OnboardingWizard StaffDashboard`
Expected: existing tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/groomer/GbpConnectButton.jsx apps/web/src/groomer/GbpConnectButton.test.jsx apps/web/src/groomer/onboarding/steps.jsx apps/web/src/groomer/StaffDashboard.jsx
git commit -m "feat(groomer): add mock Google Business Profile connect"
```

---

## CHECKPOINT — Phase 5 complete (demo-ready)

Final verification:
- [ ] `npm test` green; `npm run build` succeeds; `git diff --check` clean.
- [ ] **Deposit:** set a groomer's `requires_deposit = true`; as the customer, on a confirmed appointment click "Pay deposit" → the mock modal succeeds → a `payment_intents` row with `status='succeeded'` exists.
- [ ] **GBP:** as the groomer, click "Connect Google Business Profile" → a "✓ Google-verified" badge appears and a `groomer_integrations` row with `status='connected'` exists.
- [ ] **Adapters:** `npm test --workspace @paw-status/web -- integrations` passes (Stripe + Square fakes).
- [ ] No real network calls to Stripe, Square, or Google were made.

**Deliverable:** all five phases complete. ShinyPawz can demo the full two-sided relationship — groomer onboarding, real slot booking, accept/decline, waitlist backfill, and mock payments/integrations — end to end.

---

## Cross-phase close-out (after all 5 plans)

These tidy up items from spec §15–§16 once Phases 1–5 land:
- [ ] Flesh out `scripts/supabase-hardening-checks.js` with probes: anon cannot read `groomer_time_off` / `notifications` / `payment_intents`; a customer cannot read another customer's `appointments`; a non-verified groomer cannot `confirm_appointment_request`.
- [ ] `BlackoutEditor` (uses Phase 1 `groomer_time_off`) + a `GroomerSettingsPanel` consolidating location/`requires_deposit`/`accepts_waitlist`/GBP.
- [ ] Optional: a demo seed helper that creates one fully-onboarded groomer for instant demos.
- [ ] Run the full **demo runbook** (spec §18) end to end before presenting.
- [ ] Coverage pass to the 80% target across the new modules.
