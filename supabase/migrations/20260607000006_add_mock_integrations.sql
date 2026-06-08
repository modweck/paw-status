-- Phase 5 Mock Integrations: Payment intents and GBP connection
--
-- This migration adds mock payment and Google Business Profile integration infrastructure
-- for Phase 5 testing and integration workflows.
--
-- Tables:
--   payment_intents     - Mock payment records tied to appointments
--   groomer_integrations - Integration status and metadata for groomers (e.g., GBP)
--
-- RPCs:
--   create_deposit_intent(p_appointment_id uuid) - creates a mock payment intent
--   connect_gbp(p_groomer_id uuid)              - upserts a GBP integration
--
-- RLS summary:
--   payment_intents       → customers can SELECT their own; no client INSERT
--   groomer_integrations  → public SELECT; no client INSERT (server-side only)

-- ---------------------------------------------------------------------------
-- payment_intents
-- ---------------------------------------------------------------------------
-- Mock payment intent records tied to appointments.
-- Status: typically 'succeeded' for demo data.

create table if not exists payment_intents (
  id              uuid           primary key default gen_random_uuid(),
  appointment_id  uuid           not null references appointments(id) on delete cascade,
  customer_id     uuid           not null references auth.users(id) on delete cascade,
  external_ref    text           not null,
  amount_cents    int            not null,
  status          text           not null default 'succeeded',
  created_at      timestamptz    not null default now()
);

create index if not exists payment_intents_appointment_idx
  on payment_intents (appointment_id);

create index if not exists payment_intents_customer_idx
  on payment_intents (customer_id);

alter table payment_intents enable row level security;

revoke all on table payment_intents from anon;
grant select on table payment_intents to authenticated;

drop policy if exists "customers see own payment intents" on payment_intents;
create policy "customers see own payment intents"
  on payment_intents
  for select
  to authenticated
  using (
    customer_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- groomer_integrations
-- ---------------------------------------------------------------------------
-- Integration metadata for groomers (e.g., Google Business Profile).
-- Provider: 'gbp' (Google Business Profile), etc.
-- Status: 'connected', 'pending', 'failed', etc.

create table if not exists groomer_integrations (
  id              uuid           primary key default gen_random_uuid(),
  groomer_id      uuid           not null references groomers(id) on delete cascade,
  provider        text           not null,
  status          text           not null,
  metadata        jsonb          default '{}'::jsonb,
  created_at      timestamptz    not null default now()
);

create index if not exists groomer_integrations_groomer_provider_idx
  on groomer_integrations (groomer_id, provider);

create index if not exists groomer_integrations_provider_idx
  on groomer_integrations (provider, status);

alter table groomer_integrations enable row level security;

revoke all on table groomer_integrations from anon;
grant select on table groomer_integrations to authenticated;

drop policy if exists "authenticated can see groomer integrations" on groomer_integrations;
create policy "authenticated can see groomer integrations"
  on groomer_integrations
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- create_deposit_intent(p_appointment_id uuid) RPC
-- ---------------------------------------------------------------------------
-- Creates a mock payment intent for an appointment.
-- Verifies that the caller owns the appointment (via the dog and customer relationship).
-- Inserts a payment_intents row with status = 'succeeded' and a mock external_ref.
--
-- Signature: create_deposit_intent(p_appointment_id uuid) returns uuid
-- Returns the newly created payment_intents.id, or raises 42501 if unauthorized.

create or replace function create_deposit_intent(p_appointment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_amount_cents int;
  v_payment_intent_id uuid;
begin
  -- Verify that the caller owns the appointment.
  -- The appointment is owned by the customer via the dog's customer_id.
  select c.id, coalesce(a.price, 50000) into v_customer_id, v_amount_cents
  from appointments a
  join dogs d on d.id = a.dog_id
  join customers c on c.id = d.customer_id
  where a.id = p_appointment_id
    and c.auth_user_id = auth.uid();

  if v_customer_id is null then
    raise exception 'appointment not found or caller does not own it'
      using errcode = '42501'; -- PERMISSION_DENIED
  end if;

  -- Create the mock payment intent.
  insert into payment_intents (
    appointment_id,
    customer_id,
    external_ref,
    amount_cents,
    status
  ) values (
    p_appointment_id,
    auth.uid(),
    'pi_demo_' || encode(gen_random_bytes(12), 'hex'),
    v_amount_cents,
    'succeeded'
  )
  returning id into v_payment_intent_id;

  return v_payment_intent_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- connect_gbp(p_groomer_id uuid) RPC
-- ---------------------------------------------------------------------------
-- Upserts a groomer_integrations row for Google Business Profile.
-- Verifies that the caller is a verified groomer for the given groomer_id.
--
-- Signature: connect_gbp(p_groomer_id uuid) returns uuid
-- Returns the groomer_integrations.id, or raises 42501 if unauthorized.

create or replace function connect_gbp(p_groomer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_integration_id uuid;
begin
  -- Verify that the caller is a verified groomer for p_groomer_id.
  if not exists (
    select 1
    from groomer_memberships gm
    join groomer_accounts ga on ga.id = gm.groomer_account_id
    where gm.groomer_id = p_groomer_id
      and gm.status = 'verified'
      and ga.auth_user_id = auth.uid()
  ) then
    raise exception 'caller is not a verified groomer for this groomer'
      using errcode = '42501'; -- PERMISSION_DENIED
  end if;

  -- Upsert the groomer_integrations row.
  insert into groomer_integrations (
    groomer_id,
    provider,
    status,
    metadata
  ) values (
    p_groomer_id,
    'gbp',
    'connected',
    jsonb_build_object(
      'rating', 4.8,
      'reviewCount', 127,
      'verified', true
    )
  )
  on conflict (groomer_id, provider) do update
  set
    status = 'connected',
    metadata = jsonb_build_object(
      'rating', 4.8,
      'reviewCount', 127,
      'verified', true
    )
  returning id into v_integration_id;

  return v_integration_id;
end;
$$;
