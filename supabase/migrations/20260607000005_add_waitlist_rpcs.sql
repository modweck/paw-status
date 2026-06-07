-- Phase 4 Waitlist and Next-Available Slot RPCs
--
-- This migration adds the core waitlist operations:
--   1. groomers_serving_point() - query groomers by location + service
--   2. app_private.offer_to_next_waitlist_entry() - private helper to select oldest waitlist entry and create offer
--   3. claim_waitlist_offer() - customer claims an offer and books appointment
--   4. offer_waitlist_slot() - groomer offers a specific slot to next waiting customer
--   5. Updated cancel_appointment() - adds waitlist backfill on cancellation
--
-- Also adds:
--   - accepts_waitlist column to groomers table

-- ---------------------------------------------------------------------------
-- Step 1: Add accepts_waitlist column to groomers
-- ---------------------------------------------------------------------------

alter table groomers
  add column if not exists accepts_waitlist boolean not null default false;

-- ---------------------------------------------------------------------------
-- Step 2: Create groomers_serving_point() RPC
-- ---------------------------------------------------------------------------
-- Returns groomer metadata + distance for groomers offering a service at a location.
-- Filters by:
--   - Service offering (exact match on groomer_service_offerings.service)
--   - Distance from point (within p_radius_m)
--
-- Returns: groomer_id, name, salon, address, phone, service, duration_minutes,
--          distance_meters (ordered by distance, limit 50)

create or replace function groomers_serving_point(
  p_lat float8,
  p_lng float8,
  p_radius_m int,
  p_service_id text
)
returns table (
  groomer_id uuid,
  name text,
  salon text,
  address text,
  phone text,
  service text,
  duration_minutes int,
  distance_meters float8
)
language sql
stable
set search_path = public
as $$
  select
    g.id as groomer_id,
    g.name,
    g.salon,
    g.address,
    g.phone,
    gso.service,
    gso.duration_minutes,
    st_distance(g.location, st_makepoint(p_lng, p_lat)::geography) as distance_meters
  from groomers g
  join groomer_service_offerings gso on gso.groomer_id = g.id
  where gso.service = p_service_id
    and st_dwithin(g.location, st_makepoint(p_lng, p_lat)::geography, p_radius_m)
  order by distance_meters
  limit 50;
$$;

-- ---------------------------------------------------------------------------
-- Step 3: Create app_private.offer_to_next_waitlist_entry() private helper
-- ---------------------------------------------------------------------------
-- Selects the oldest active waitlist entry (per-groomer match preferred over geo-match),
-- creates a waitlist_offer, marks entry as 'offered', and notifies customer.
--
-- Signature: app_private.offer_to_next_waitlist_entry(
--   p_groomer_id uuid,
--   p_service_id text,
--   p_slot_at timestamptz,
--   p_duration_minutes int
-- ) returns uuid
--
-- Returns: the newly created waitlist_offer.id (or NULL if no eligible entry found)

create or replace function app_private.offer_to_next_waitlist_entry(
  p_groomer_id uuid,
  p_service_id text,
  p_slot_at timestamptz,
  p_duration_minutes int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
  v_customer_id uuid;
  v_customer_auth_id uuid;
  v_offer_id uuid;
begin
  -- Select the oldest active entry for this groomer+service (per-groomer match preferred)
  select we.id, we.customer_id
  into v_entry_id, v_customer_id
  from waitlist_entries we
  where we.status = 'active'
    and we.service_id = p_service_id
    and we.groomer_id = p_groomer_id
  order by we.created_at asc
  limit 1;

  -- If no per-groomer match, try geo-match (location + radius)
  if v_entry_id is null then
    select we.id, we.customer_id
    into v_entry_id, v_customer_id
    from waitlist_entries we
    where we.status = 'active'
      and we.service_id = p_service_id
      and we.groomer_id is null
      and we.location is not null
      and we.radius_m is not null
      and st_dwithin(we.location, (select location from groomers where id = p_groomer_id), we.radius_m)
    order by we.created_at asc
    limit 1;
  end if;

  -- If no entry found, return null
  if v_entry_id is null then
    return null;
  end if;

  -- Create the offer with 60-minute expiration
  insert into waitlist_offers (
    entry_id,
    groomer_id,
    service_id,
    slot_at,
    duration_minutes,
    status,
    expires_at
  ) values (
    v_entry_id,
    p_groomer_id,
    p_service_id,
    p_slot_at,
    p_duration_minutes,
    'pending',
    now() + interval '60 minutes'
  )
  returning id into v_offer_id;

  -- Update the entry status to 'offered'
  update waitlist_entries
  set status = 'offered'
  where id = v_entry_id;

  -- Notify the customer with kind='waitlist_offer'
  select c.auth_user_id
  into v_customer_auth_id
  from customers c
  where c.id = v_customer_id;

  if v_customer_auth_id is not null then
    perform app_private.notify(
      p_recipient => v_customer_auth_id,
      p_kind => 'waitlist_offer',
      p_title => 'Available slot for ' || p_service_id,
      p_body => 'A groomer has an available slot that matches your waitlist request',
      p_data => jsonb_build_object(
        'offer_id', v_offer_id,
        'entry_id', v_entry_id,
        'groomer_id', p_groomer_id,
        'service_id', p_service_id,
        'slot_at', p_slot_at,
        'duration_minutes', p_duration_minutes,
        'expires_at', now() + interval '60 minutes'
      )
    );
  end if;

  return v_offer_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Step 4: Create claim_waitlist_offer() RPC
-- ---------------------------------------------------------------------------
-- Verifies caller owns the entry, checks offer validity, creates appointment,
-- marks offer/entry as claimed/fulfilled, and notifies groomer.
--
-- Signature: claim_waitlist_offer(p_offer_id uuid) returns uuid
-- Returns: the newly created appointment.id
--
-- SECURITY DEFINER: runs with elevated privileges to create appointment

create or replace function claim_waitlist_offer(
  p_offer_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer record;
  v_entry_id uuid;
  v_customer_id uuid;
  v_groomer_id uuid;
  v_service_id text;
  v_slot_at timestamptz;
  v_duration_minutes int;
  v_dog_id uuid;
  v_appointment_id uuid;
  v_groomer_account_id uuid;
begin
  -- Get the offer details
  select wo.id, wo.entry_id, wo.groomer_id, wo.service_id, wo.slot_at, wo.duration_minutes, wo.status, wo.expires_at
  into v_offer
  from waitlist_offers wo
  where wo.id = p_offer_id;

  if v_offer is null then
    raise exception 'Offer not found';
  end if;

  v_entry_id := v_offer.entry_id;
  v_groomer_id := v_offer.groomer_id;
  v_service_id := v_offer.service_id;
  v_slot_at := v_offer.slot_at;
  v_duration_minutes := v_offer.duration_minutes;

  -- Get the entry to verify ownership and get customer/dog info
  select we.customer_id
  into v_customer_id
  from waitlist_entries we
  where we.id = v_entry_id;

  if v_customer_id is null then
    raise exception 'Entry not found';
  end if;

  -- Verify caller owns the entry
  if not exists (
    select 1
    from customers c
    where c.id = v_customer_id
      and c.auth_user_id = (select auth.uid())
  ) then
    raise exception 'Not authorized to claim this offer';
  end if;

  -- Verify offer is still pending and not expired
  if v_offer.status != 'pending' then
    raise exception 'Offer is no longer available';
  end if;

  if v_offer.expires_at <= now() then
    raise exception 'Offer has expired';
  end if;

  -- Get a dog belonging to this customer (pick any one for now)
  select id into v_dog_id
  from dogs
  where customer_id = v_customer_id
  limit 1;

  if v_dog_id is null then
    raise exception 'Customer has no dogs';
  end if;

  -- Create the appointment (may raise 23P01 if there is a conflict)
  begin
    insert into appointments (
      dog_id,
      groomer_id,
      service_id,
      scheduled_at,
      duration_minutes,
      status
    ) values (
      v_dog_id,
      v_groomer_id,
      v_service_id,
      v_slot_at,
      v_duration_minutes,
      'confirmed'
    )
    returning id into v_appointment_id;
  exception
    when sqlstate '23P01' then
      raise exception 'That time was just booked';
  end;

  -- Update the offer status to 'claimed'
  update waitlist_offers
  set status = 'claimed'
  where id = p_offer_id;

  -- Update the entry status to 'fulfilled'
  update waitlist_entries
  set status = 'fulfilled'
  where id = v_entry_id;

  -- Notify the groomer with kind='waitlist_claimed'
  select ga.id
  into v_groomer_account_id
  from groomer_memberships gm
  join groomer_accounts ga on ga.id = gm.groomer_account_id
  where gm.groomer_id = v_groomer_id
    and gm.status = 'verified'
  limit 1;

  if v_groomer_account_id is not null then
    perform app_private.notify(
      p_recipient => (select auth_user_id from groomer_accounts where id = v_groomer_account_id),
      p_kind => 'waitlist_claimed',
      p_title => 'Waitlist offer accepted',
      p_body => 'Your offered slot was accepted by a customer',
      p_data => jsonb_build_object(
        'offer_id', p_offer_id,
        'appointment_id', v_appointment_id,
        'customer_id', v_customer_id,
        'service_id', v_service_id,
        'slot_at', v_slot_at,
        'duration_minutes', v_duration_minutes
      )
    );
  end if;

  return v_appointment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Step 5: Create offer_waitlist_slot() RPC
-- ---------------------------------------------------------------------------
-- Groomer-facing RPC to offer a specific time slot to the next waiting customer.
-- Verifies caller is a verified groomer for p_groomer_id.
-- Calls app_private.offer_to_next_waitlist_entry() to do the work.
--
-- Signature: offer_waitlist_slot(
--   p_groomer_id uuid,
--   p_slot_at timestamptz,
--   p_service_id text
-- ) returns uuid
--
-- Returns: the newly created waitlist_offer.id (or NULL if no eligible entry)

create or replace function offer_waitlist_slot(
  p_groomer_id uuid,
  p_slot_at timestamptz,
  p_service_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duration_minutes int;
  v_offer_id uuid;
begin
  -- Verify caller is a verified groomer for this groomer_id
  if not exists (
    select 1
    from groomer_memberships gm
    join groomer_accounts ga on ga.id = gm.groomer_account_id
    where gm.groomer_id = p_groomer_id
      and gm.status = 'verified'
      and ga.auth_user_id = (select auth.uid())
  ) then
    raise exception 'Not authorized to offer slots for this groomer';
  end if;

  -- Get the duration_minutes from the service offering
  select gso.duration_minutes
  into v_duration_minutes
  from groomer_service_offerings gso
  where gso.groomer_id = p_groomer_id
    and gso.service = p_service_id
  limit 1;

  if v_duration_minutes is null then
    raise exception 'Service offering not found for this groomer';
  end if;

  -- Call the private helper
  v_offer_id := app_private.offer_to_next_waitlist_entry(
    p_groomer_id,
    p_service_id,
    p_slot_at,
    v_duration_minutes
  );

  return v_offer_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Step 6: Replace cancel_appointment() to add waitlist backfill
-- ---------------------------------------------------------------------------
-- Updated to call app_private.offer_to_next_waitlist_entry() for the freed slot
-- if the groomer accepts waitlist and the service is non-null.

create or replace function cancel_appointment(
  p_appointment_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment record;
  v_dog_id uuid;
  v_groomer_id uuid;
  v_customer_id uuid;
  v_customer_auth_id uuid;
  v_groomer_account_id uuid;
  v_caller_is_groomer boolean;
  v_caller_is_customer boolean;
  v_offer_id uuid;
begin
  -- Get the appointment details
  select a.id, a.dog_id, a.groomer_id, a.service_id, a.scheduled_at, a.duration_minutes
    into v_appointment
    from public.appointments a
    where a.id = p_appointment_id;

  if v_appointment is null then
    raise exception 'Appointment not found';
  end if;

  v_dog_id := v_appointment.dog_id;
  v_groomer_id := v_appointment.groomer_id;

  -- Get the customer ID from the dog
  select d.customer_id
    into v_customer_id
    from public.dogs d
    where d.id = v_dog_id;

  -- Get the customer's auth user ID
  select c.auth_user_id
    into v_customer_auth_id
    from public.customers c
    where c.id = v_customer_id;

  -- Check if caller is the groomer for this appointment
  select exists (
    select 1
    from public.groomer_memberships gm
    join public.groomer_accounts ga on ga.id = gm.groomer_account_id
    where gm.groomer_id = v_groomer_id
      and gm.status = 'verified'
      and ga.auth_user_id = (select auth.uid())
  ) into v_caller_is_groomer;

  -- Check if caller is the customer for this appointment
  select exists (
    select 1
    from public.customers c
    where c.id = v_customer_id
      and c.auth_user_id = (select auth.uid())
  ) into v_caller_is_customer;

  -- Verify caller is authorized (either the groomer or the customer)
  if not (v_caller_is_groomer or v_caller_is_customer) then
    raise exception 'Not authorized to cancel this appointment';
  end if;

  -- Update the appointment status to cancelled
  update public.appointments
    set status = 'cancelled', updated_at = now()
    where id = p_appointment_id;

  -- Notify the other party
  if v_caller_is_groomer then
    -- Groomer cancelled, notify customer
    if v_customer_auth_id is not null then
      perform public.app_private.notify(
        p_recipient => v_customer_auth_id,
        p_kind => 'appointment_cancelled',
        p_title => 'Your appointment was cancelled by the groomer',
        p_body => 'Your appointment has been cancelled' || (case when p_reason is not null then ': ' || p_reason else '' end),
        p_data => jsonb_build_object(
          'appointment_id', p_appointment_id,
          'groomer_id', v_groomer_id,
          'reason', p_reason
        )
      );
    end if;
  elsif v_caller_is_customer then
    -- Customer cancelled, notify groomer
    select ga.id
      into v_groomer_account_id
      from public.groomer_memberships gm
      join public.groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = v_groomer_id
        and gm.status = 'verified'
      limit 1;

    if v_groomer_account_id is not null then
      perform public.app_private.notify(
        p_recipient => (select auth_user_id from public.groomer_accounts where id = v_groomer_account_id),
        p_kind => 'appointment_cancelled',
        p_title => 'An appointment was cancelled by the customer',
        p_body => 'An appointment has been cancelled' || (case when p_reason is not null then ': ' || p_reason else '' end),
        p_data => jsonb_build_object(
          'appointment_id', p_appointment_id,
          'customer_id', v_customer_id,
          'reason', p_reason
        )
      );
    end if;
  end if;

  -- NEW: Waitlist backfill - if groomer accepts waitlist and service is non-null, offer the freed slot
  if v_caller_is_groomer then
    if exists (
      select 1
      from public.groomers g
      where g.id = v_groomer_id
        and g.accepts_waitlist = true
    ) and v_appointment.service_id is not null then
      v_offer_id := public.app_private.offer_to_next_waitlist_entry(
        v_groomer_id,
        v_appointment.service_id,
        v_appointment.scheduled_at,
        v_appointment.duration_minutes
      );
    end if;
  end if;
end;
$$;
