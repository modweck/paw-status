-- Phase 3 Booking Lifecycle RPCs
--
-- This migration adds RPCs for the complete booking lifecycle:
--   1. SELECT policy on appointments for verified groomers
--   2. confirm_appointment_request() - convert request to confirmed appointment
--   3. decline_appointment_request() - decline a request
--   4. cancel_appointment() - cancel an existing appointment

-- ---------------------------------------------------------------------------
-- Step 1: Add SELECT policy on appointments for verified groomers
-- ---------------------------------------------------------------------------
-- Verified groomers can see their own appointments

drop policy if exists "verified groomers see own appointments" on appointments;
create policy "verified groomers see own appointments"
  on appointments
  for select
  to authenticated
  using (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = appointments.groomer_id
        and gm.status = 'verified'
        and ga.auth_user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Step 2: Create confirm_appointment_request() RPC
-- ---------------------------------------------------------------------------
-- This function:
--   - Verifies the caller is a verified groomer for the request's groomer
--   - Inserts a new appointment with the confirmed slot time
--   - Catches double-booking violations (23P01) and re-raises as user-facing error
--   - Updates the request status to 'confirmed'
--   - Notifies the customer with kind='request_confirmed'

create or replace function confirm_appointment_request(
  p_request_id uuid,
  p_slot_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request record;
  v_groomer_id uuid;
  v_customer_id uuid;
  v_dog_id uuid;
  v_service text;
  v_duration_minutes int;
  v_appointment_id uuid;
  v_customer_auth_id uuid;
begin
  -- Get the appointment request details
  select ar.id, ar.groomer_id, ar.customer_id, ar.dog_id, ar.service
    into v_request
    from public.appointment_requests ar
    where ar.id = p_request_id;

  if v_request is null then
    raise exception 'Appointment request not found';
  end if;

  v_groomer_id := v_request.groomer_id;
  v_customer_id := v_request.customer_id;
  v_dog_id := v_request.dog_id;
  v_service := v_request.service;

  -- Verify caller is a verified groomer for this request's groomer
  if not exists (
    select 1
    from public.groomer_memberships gm
    join public.groomer_accounts ga on ga.id = gm.groomer_account_id
    where gm.groomer_id = v_groomer_id
      and gm.status = 'verified'
      and ga.auth_user_id = (select auth.uid())
  ) then
    raise exception 'Not authorized to confirm appointments for this groomer';
  end if;

  -- Get duration from the matching groomer_service_offerings
  -- Match by service name
  select gso.duration_minutes
    into v_duration_minutes
    from public.groomer_service_offerings gso
    where gso.groomer_id = v_groomer_id
      and gso.service = v_service
    limit 1;

  if v_duration_minutes is null then
    raise exception 'Service offering not found for groomer';
  end if;

  -- Insert the appointment with the confirmed slot
  -- This may raise 23P01 (GIST overlap exclusion violation) if there's a conflict
  begin
    insert into public.appointments (
      dog_id,
      groomer_id,
      service_id,
      scheduled_at,
      duration_minutes,
      status
    ) values (
      v_dog_id,
      v_groomer_id,
      v_service,
      p_slot_at,
      v_duration_minutes,
      'confirmed'
    )
    returning id into v_appointment_id;
  exception
    when sqlstate '23P01' then
      raise exception 'That time was just booked';
  end;

  -- Update the request status to confirmed
  update public.appointment_requests
    set status = 'confirmed', updated_at = now()
    where id = p_request_id;

  -- Notify the customer with kind='request_confirmed'
  select c.auth_user_id
    into v_customer_auth_id
    from public.customers c
    where c.id = v_customer_id;

  if v_customer_auth_id is not null then
    perform public.app_private.notify(
      p_recipient => v_customer_auth_id,
      p_kind => 'request_confirmed',
      p_title => 'Your appointment request was confirmed!',
      p_body => 'Appointment confirmed for ' || coalesce(v_service, 'grooming'),
      p_data => jsonb_build_object(
        'appointment_request_id', p_request_id,
        'appointment_id', v_appointment_id,
        'groomer_id', v_groomer_id,
        'scheduled_at', p_slot_at,
        'service', v_service
      )
    );
  end if;

  return v_appointment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Step 3: Create decline_appointment_request() RPC
-- ---------------------------------------------------------------------------
-- This function:
--   - Verifies the caller is a verified groomer for the request's groomer
--   - Updates the request status to 'declined'
--   - Notifies the customer with kind='request_declined'

create or replace function decline_appointment_request(
  p_request_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request record;
  v_groomer_id uuid;
  v_customer_id uuid;
  v_customer_auth_id uuid;
begin
  -- Get the appointment request details
  select ar.id, ar.groomer_id, ar.customer_id
    into v_request
    from public.appointment_requests ar
    where ar.id = p_request_id;

  if v_request is null then
    raise exception 'Appointment request not found';
  end if;

  v_groomer_id := v_request.groomer_id;
  v_customer_id := v_request.customer_id;

  -- Verify caller is a verified groomer for this request's groomer
  if not exists (
    select 1
    from public.groomer_memberships gm
    join public.groomer_accounts ga on ga.id = gm.groomer_account_id
    where gm.groomer_id = v_groomer_id
      and gm.status = 'verified'
      and ga.auth_user_id = (select auth.uid())
  ) then
    raise exception 'Not authorized to decline appointments for this groomer';
  end if;

  -- Update the request status to declined
  update public.appointment_requests
    set status = 'declined', updated_at = now()
    where id = p_request_id;

  -- Notify the customer with kind='request_declined'
  select c.auth_user_id
    into v_customer_auth_id
    from public.customers c
    where c.id = v_customer_id;

  if v_customer_auth_id is not null then
    perform public.app_private.notify(
      p_recipient => v_customer_auth_id,
      p_kind => 'request_declined',
      p_title => 'Your appointment request was declined',
      p_body => 'The groomer was unable to accommodate your request' || (case when p_note is not null then ': ' || p_note else '' end),
      p_data => jsonb_build_object(
        'appointment_request_id', p_request_id,
        'groomer_id', v_groomer_id,
        'note', p_note
      )
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Step 4: Create cancel_appointment() RPC
-- ---------------------------------------------------------------------------
-- Phase 3 version: no waitlist backfill
-- This function:
--   - Sets appointments.status = 'cancelled'
--   - Notifies the other party (customer or groomer as appropriate)

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
begin
  -- Get the appointment details
  select a.id, a.dog_id, a.groomer_id
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
end;
$$;
