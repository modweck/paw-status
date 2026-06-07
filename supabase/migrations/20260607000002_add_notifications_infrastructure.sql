-- Phase 3 Notifications Infrastructure
--
-- This migration adds:
--   1. app_private schema (if not exists)
--   2. notifications table with RLS policies
--   3. app_private.notify() SECURITY DEFINER function for server-side inserts
--   4. AFTER INSERT trigger on appointment_requests to notify groomers
--   5. Supabase Realtime publication for notifications

-- ---------------------------------------------------------------------------
-- Step 1: Create app_private schema (if not exists)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'app_private') then
    create schema app_private;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Step 2: Create notifications table
-- ---------------------------------------------------------------------------

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx
  on notifications (recipient_id, created_at desc);

create index if not exists notifications_recipient_read_idx
  on notifications (recipient_id, read_at, created_at desc);

-- ---------------------------------------------------------------------------
-- Step 3: Enable RLS on notifications table
-- ---------------------------------------------------------------------------

alter table notifications enable row level security;

-- Revoke all access by default
revoke all on table notifications from anon, authenticated, service_role;

-- Allow authenticated users to SELECT their own rows
grant select on table notifications to authenticated;

-- Allow authenticated users to UPDATE read_at on their own rows
grant update on table notifications to authenticated;

-- Create SELECT policy: authenticated users see only their own notifications
drop policy if exists "authenticated see own notifications" on notifications;
create policy "authenticated see own notifications"
  on notifications
  for select
  to authenticated
  using (recipient_id = auth.uid());

-- Create UPDATE policy: authenticated users can mark their own notifications as read
drop policy if exists "authenticated update own notifications read_at" on notifications;
create policy "authenticated update own notifications read_at"
  on notifications
  for update
  to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- Note: No INSERT policy — inserts happen only via the app_private.notify() function

-- ---------------------------------------------------------------------------
-- Step 4: Create app_private.notify() SECURITY DEFINER function
-- ---------------------------------------------------------------------------
-- This function inserts a notification row with elevated privileges.
-- It is called by database triggers (which run with the table owner's privileges).
--
-- Signature: app_private.notify(
--   p_recipient uuid,
--   p_kind text,
--   p_title text,
--   p_body text,
--   p_data jsonb
-- ) returns uuid

create or replace function app_private.notify(
  p_recipient uuid,
  p_kind text,
  p_title text,
  p_body text default null,
  p_data jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification_id uuid;
begin
  insert into notifications (
    recipient_id,
    kind,
    title,
    body,
    data
  ) values (
    p_recipient,
    p_kind,
    p_title,
    p_body,
    p_data
  )
  returning id into v_notification_id;

  return v_notification_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Step 5: Create AFTER INSERT trigger on appointment_requests
-- ---------------------------------------------------------------------------
-- When a new appointment request is created, notify the groomer.

create or replace function notify_groomer_on_appointment_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_groomer_account_id uuid;
  v_groomer_name text;
  v_customer_name text;
  v_dog_name text;
  v_service text;
  v_notification_data jsonb;
begin
  -- Get the groomer account ID (which links to the auth user)
  select ga.id, g.name
  into v_groomer_account_id, v_groomer_name
  from groomers g
  left join groomer_accounts ga on ga.id = g.owner_account_id
  where g.id = new.groomer_id;

  -- Only notify if the groomer has an associated account
  if v_groomer_account_id is not null then
    -- Get customer and dog info for the notification
    select c.name, d.name
    into v_customer_name, v_dog_name
    from customers c
    join dogs d on d.customer_id = c.id
    where c.id = new.customer_id and d.id = new.dog_id;

    -- Build notification data
    v_notification_data := jsonb_build_object(
      'appointment_request_id', new.id,
      'groomer_id', new.groomer_id,
      'groomer_name', v_groomer_name,
      'customer_name', v_customer_name,
      'dog_name', v_dog_name,
      'service', new.service,
      'status', new.status,
      'created_at', new.created_at
    );

    -- Insert notification via app_private.notify()
    perform app_private.notify(
      p_recipient => (select auth_user_id from groomer_accounts where id = v_groomer_account_id),
      p_kind => 'new_request',
      p_title => 'New appointment request from ' || coalesce(v_customer_name, 'customer'),
      p_body => v_dog_name || ' needs ' || new.service,
      p_data => v_notification_data
    );
  end if;

  return new;
end;
$$;

-- Drop existing trigger if it exists
drop trigger if exists notify_groomer_on_request on appointment_requests;

-- Create the trigger
create trigger notify_groomer_on_request
  after insert on appointment_requests
  for each row
  execute function notify_groomer_on_appointment_request();

-- ---------------------------------------------------------------------------
-- Step 6: Enable Supabase Realtime for notifications table
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table notifications;
