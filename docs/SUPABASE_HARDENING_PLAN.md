# Supabase Hardening Plan

This is the first implementation plan for making PawStatus safe enough to rebuild on top of.

## Goal

Replace the prototype data access model with real identity and ownership boundaries:

- Customers can only access their own customer profile, dogs, and appointments.
- Groomers can only access appointments assigned to their salon or organization.
- Public users can browse groomer search data only.
- Server-side secrets stay out of browser code.

## Current Problem

The prototype has two competing models:

- `db/schema.sql` defines auth-gated policies around `customers.auth_user_id`.
- `db/02_relax_rls_prototype.sql` replaces those policies with public read/write policies.

The app also bypasses real auth in `index.html`, so restoring strict RLS will break booking until the frontend uses Supabase Auth.

## Step 1: Confirm Live Policy State

- [ ] Use Supabase SQL editor, CLI link, or MCP to inspect `pg_policies`.
- [ ] Confirm whether `prototype_customers_all`, `prototype_dogs_all`, and `prototype_appointments_all` exist live.
- [ ] Confirm whether original auth-gated policies still exist.
- [ ] Confirm whether RLS is enabled on `groomers`, `customers`, `dogs`, and `appointments`.
- [ ] Confirm whether the current browser app depends on public writes.

Suggested SQL:

```sql
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('groomers', 'customers', 'dogs', 'appointments')
order by tablename, policyname;

select relname, relrowsecurity, relforcerowsecurity
from pg_class
where relname in ('groomers', 'customers', 'dogs', 'appointments');
```

## Step 2: Choose Customer Auth

Decision needed:

- [ ] Phone OTP
- [ ] Email magic link

Recommended first pass:

- Email magic link if speed and simplicity matter most.
- Phone OTP if customer phone identity is central to the product and SMS cost/setup is acceptable.

Current note: use email magic links first, then revisit phone OTP after the booking flow is stable. See `docs/SUPABASE_MAGIC_LINK_NOTES.md`.

The current localStorage customer identity must be replaced either way.

## Step 3: Add Groomer Ownership Model

Add production tables:

- [ ] `salons`
- [ ] `groomer_profiles`
- [ ] `salon_memberships`

Suggested shape:

```sql
create table salons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table groomer_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz default now()
);

create table salon_memberships (
  salon_id uuid not null references salons(id) on delete cascade,
  groomer_profile_id uuid not null references groomer_profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'groomer')),
  created_at timestamptz default now(),
  primary key (salon_id, groomer_profile_id)
);
```

Then connect appointments to salon ownership. Options:

- Add `salon_id` to `appointments`.
- Or add `salon_id` to `groomers` and derive appointment access through `appointments.groomer_id`.

Recommended first pass:

- Add `salon_id` to `groomers`.
- Use existing `appointments.groomer_id`.

## Step 4: Replace Prototype RLS

Production policies should allow:

- Public read on safe groomer search fields.
- Customer read/update only for `customers.auth_user_id = auth.uid()`.
- Customer access to dogs through their customer row.
- Customer appointment access through their dog rows.
- Groomer appointment access through salon membership.

Do not expose customer phone numbers through public groomer search.

## Step 5: Server-Side Status Updates

For groomer status changes, prefer a Netlify function or Supabase RPC that:

- Authenticates the groomer.
- Verifies salon membership.
- Validates allowed status transition.
- Updates `appointments.status`.
- Writes an appointment event.
- Sends SMS after the database update succeeds.

This avoids trusting browser-side direct PATCH requests from `groomer-dashboard.html`.

## Step 6: Verify Boundaries

Before calling the hardening work done:

- [ ] Anonymous users can search groomers but cannot read customers.
- [ ] Anonymous users cannot create customers, dogs, or appointments.
- [ ] Customer A cannot read Customer B's dogs or appointments.
- [ ] Groomer A cannot read appointments for another salon.
- [ ] Status updates fail without groomer membership.
- [ ] Status updates succeed for an authorized groomer.

## First Safe Implementation Target

Do not apply destructive live changes yet. First build:

- [ ] A migration for salon/groomer ownership tables.
- [ ] A migration for appointment event history.
- [ ] A frontend auth strategy note.
- [ ] A protected status update function design.

Then apply and verify against a local Supabase instance or a Supabase branch before touching production.
