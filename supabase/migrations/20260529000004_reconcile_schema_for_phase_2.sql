-- Phase 2 Schema Reconciliation
--
-- This migration reconciles the schema for Phase 2 development:
--   1. Rename groomer_offerings → groomer_service_offerings (with index rename)
--   2. Rename groomer_weekly_hours → groomer_availability (with index rename)
--   3. Migrate appointments: drop start_at/end_at, add scheduled_at/duration_minutes
--      and convert service_id from uuid → text (decoupling from service_offerings table)
--   4. Refactor double-booking constraint to use scheduled_at + duration_minutes
--
-- All steps are idempotent and preserve existing data.

-- ---------------------------------------------------------------------------
-- Step 1: Rename groomer_offerings → groomer_service_offerings
-- ---------------------------------------------------------------------------

do $$
begin
  -- Only rename if the old table still exists and the new one does not
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'groomer_offerings'
  ) and not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'groomer_service_offerings'
  ) then
    alter table groomer_offerings rename to groomer_service_offerings;
  end if;
end $$;

-- Rename the index
do $$
begin
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'groomer_service_offerings'
      and indexname = 'groomer_offerings_groomer_idx'
  ) then
    alter index groomer_offerings_groomer_idx rename to groomer_service_offerings_groomer_idx;
  end if;
end $$;

-- Ensure the index exists under the new name (in case it was already renamed)
create index if not exists groomer_service_offerings_groomer_idx
  on groomer_service_offerings (groomer_id);

-- Update RLS policies to use new table name (drop old, create new if they exist)
drop policy if exists "groomer_offerings public select" on groomer_service_offerings;
drop policy if exists "verified groomers insert own offerings" on groomer_service_offerings;
drop policy if exists "verified groomers update own offerings" on groomer_service_offerings;
drop policy if exists "verified groomers delete own offerings" on groomer_service_offerings;

create policy "groomer_service_offerings public select"
  on groomer_service_offerings
  for select
  using (true);

create policy "verified groomers insert own service offerings"
  on groomer_service_offerings
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = groomer_service_offerings.groomer_id
        and gm.status = 'verified'
        and ga.auth_user_id = (select auth.uid())
    )
  );

create policy "verified groomers update own service offerings"
  on groomer_service_offerings
  for update
  to authenticated
  using (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = groomer_service_offerings.groomer_id
        and gm.status = 'verified'
        and ga.auth_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = groomer_service_offerings.groomer_id
        and gm.status = 'verified'
        and ga.auth_user_id = (select auth.uid())
    )
  );

create policy "verified groomers delete own service offerings"
  on groomer_service_offerings
  for delete
  to authenticated
  using (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = groomer_service_offerings.groomer_id
        and gm.status = 'verified'
        and ga.auth_user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Step 2: Rename groomer_weekly_hours → groomer_availability
-- ---------------------------------------------------------------------------

do $$
begin
  -- Only rename if the old table still exists and the new one does not
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'groomer_weekly_hours'
  ) and not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'groomer_availability'
  ) then
    alter table groomer_weekly_hours rename to groomer_availability;
  end if;
end $$;

-- Rename the index
do $$
begin
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'groomer_availability'
      and indexname = 'groomer_weekly_hours_groomer_idx'
  ) then
    alter index groomer_weekly_hours_groomer_idx rename to groomer_availability_groomer_idx;
  end if;
end $$;

-- Ensure the index exists under the new name
create index if not exists groomer_availability_groomer_idx
  on groomer_availability (groomer_id, day_of_week);

-- Update RLS policies to use new table name
drop policy if exists "groomer_weekly_hours public select" on groomer_availability;
drop policy if exists "verified groomers insert own weekly hours" on groomer_availability;
drop policy if exists "verified groomers update own weekly hours" on groomer_availability;
drop policy if exists "verified groomers delete own weekly hours" on groomer_availability;

create policy "groomer_availability public select"
  on groomer_availability
  for select
  using (true);

create policy "verified groomers insert own availability"
  on groomer_availability
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = groomer_availability.groomer_id
        and gm.status = 'verified'
        and ga.auth_user_id = (select auth.uid())
    )
  );

create policy "verified groomers update own availability"
  on groomer_availability
  for update
  to authenticated
  using (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = groomer_availability.groomer_id
        and gm.status = 'verified'
        and ga.auth_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = groomer_availability.groomer_id
        and gm.status = 'verified'
        and ga.auth_user_id = (select auth.uid())
    )
  );

create policy "verified groomers delete own availability"
  on groomer_availability
  for delete
  to authenticated
  using (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = groomer_availability.groomer_id
        and gm.status = 'verified'
        and ga.auth_user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Step 3: Refactor appointments schema
-- ---------------------------------------------------------------------------
-- The appointments table transitions from:
--   service_id (uuid FK → groomer_offerings)  +  start_at/end_at (explicit time range)
-- To:
--   service_id (text, free-form service identifier)  +  scheduled_at/duration_minutes

-- Step 3a: Drop the old FK constraint on service_id (to unblock the column type change)
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'appointments'
      and constraint_type = 'FOREIGN KEY'
      and constraint_name like '%service_id%'
  ) then
    alter table appointments drop constraint if exists appointments_service_id_fkey;
  end if;
end $$;

-- Step 3b: Drop the old double-booking constraint (we'll recreate it with a new definition)
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'appointments_no_double_book'
      and conrelid = 'appointments'::regclass
  ) then
    alter table appointments drop constraint appointments_no_double_book;
  end if;
end $$;

-- Step 3c: Ensure scheduled_at exists (nullable, no default)
-- If start_at exists, we'll backfill from it
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'appointments'
      and column_name = 'scheduled_at'
  ) then
    alter table appointments
      add column scheduled_at timestamptz;
    -- Backfill from start_at if it exists
    update appointments
    set scheduled_at = start_at
    where start_at is not null and scheduled_at is null;
  end if;
end $$;

-- Step 3d: Ensure duration_minutes exists (nullable, no default)
-- If start_at and end_at exist, we'll compute duration from them
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'appointments'
      and column_name = 'duration_minutes'
  ) then
    alter table appointments
      add column duration_minutes int;
    -- Backfill from start_at/end_at if they exist
    update appointments
    set duration_minutes = extract(epoch from (end_at - start_at))::int / 60
    where start_at is not null and end_at is not null and duration_minutes is null;
  end if;
end $$;

-- Step 3e: Ensure end_at column exists (will be populated/maintained by trigger)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'appointments'
      and column_name = 'end_at'
  ) then
    alter table appointments
      add column end_at timestamptz;
    -- Backfill from old end_at if it exists (before we drop it)
    -- This is handled by checking if the column still exists before dropping
  end if;
end $$;

-- Step 3f: Convert service_id from uuid to text (if it's still uuid)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'appointments'
      and column_name = 'service_id'
      and udt_name = 'uuid'
  ) then
    alter table appointments alter column service_id type text;
  end if;
end $$;

-- Step 3g: Create or replace a trigger to compute end_at from scheduled_at + duration_minutes
-- This runs before insert or update to ensure end_at is always in sync.
-- First, drop the trigger if it exists (to allow replacing the function)
drop trigger if exists appointments_compute_end_at on appointments;

create or replace function appointments_compute_end_at()
returns trigger as $$
begin
  if new.scheduled_at is not null and new.duration_minutes is not null then
    new.end_at := new.scheduled_at + (new.duration_minutes * interval '1 minute');
  else
    new.end_at := null;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger appointments_compute_end_at
  before insert or update on appointments
  for each row
  execute function appointments_compute_end_at();

-- Step 3h: Backfill end_at using the trigger logic for any rows that don't have it
update appointments
set end_at = case
  when scheduled_at is not null and duration_minutes is not null
  then scheduled_at + (duration_minutes * interval '1 minute')
  else null
end
where end_at is null and (scheduled_at is not null or duration_minutes is not null);

-- Step 3i: NOW drop the old start_at and end_at columns (after backfill is complete)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'appointments'
      and column_name = 'start_at'
  ) then
    alter table appointments drop column start_at;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Step 4: Recreate the double-booking constraint with new signature
-- ---------------------------------------------------------------------------
-- Constraint name: appointments_no_overlap
-- Logic: no two appointments for the same groomer may have overlapping
-- time ranges, EXCEPT for cancelled and declined appointments.
-- Time range is defined by scheduled_at and end_at (computed via trigger).
-- Only applies to appointments with both scheduled_at AND end_at set.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'appointments_no_overlap'
      and conrelid = 'appointments'::regclass
  ) then
    alter table appointments
      add constraint appointments_no_overlap
      exclude using gist (
        groomer_id with =,
        tstzrange(scheduled_at, end_at) with &&
      )
      where (scheduled_at is not null and end_at is not null and status not in ('cancelled', 'declined'));
  end if;
end $$;

-- Supporting index for time range queries on the new columns
create index if not exists appointments_groomer_scheduled_duration_idx
  on appointments (groomer_id, scheduled_at, duration_minutes)
  where scheduled_at is not null;
