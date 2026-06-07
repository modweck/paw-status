-- Phase 2 Groomer Onboarding: RPCs and UPDATE policy
--
-- This migration adds:
--   1. owner_account_id column to groomers (nullable FK to groomer_accounts)
--   2. create_owned_groomer() RPC to atomically create a groomer + verified owner membership
--   3. refresh_groomer_services() RPC to sync groomers.services jsonb from service_offerings
--   4. UPDATE policy for verified groomers on their own groomer row

-- ---------------------------------------------------------------------------
-- Step 1: Add owner_account_id to groomers table
-- ---------------------------------------------------------------------------

alter table groomers
  add column if not exists owner_account_id uuid references groomer_accounts(id) on delete set null;

create index if not exists groomers_owner_account_idx
  on groomers (owner_account_id);

-- ---------------------------------------------------------------------------
-- Step 2: Create create_owned_groomer() RPC
-- ---------------------------------------------------------------------------
-- Atomically creates a groomer row and a verified owner membership.
-- Raises 42501 (permission denied) if the caller has no matching groomer_accounts row.
-- Signature: create_owned_groomer(
--   p_name text,
--   p_salon text,
--   p_address text,
--   p_lat double precision,
--   p_lng double precision,
--   p_phone text,
--   p_website text,
--   p_timezone text,
--   p_lead_time_hours int
-- ) returns uuid
--
-- Returns the newly created groomer.id.

create or replace function create_owned_groomer(
  p_name text,
  p_salon text,
  p_address text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_phone text default null,
  p_website text default null,
  p_timezone text default 'America/New_York',
  p_lead_time_hours int default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_groomer_account_id uuid;
  v_groomer_id uuid;
begin
  -- Check that the caller has a groomer_accounts row
  select id into v_groomer_account_id
  from groomer_accounts
  where auth_user_id = (select auth.uid());

  if v_groomer_account_id is null then
    raise exception 'caller must have a groomer_accounts row'
      using errcode = '42501'; -- PERMISSION_DENIED
  end if;

  -- Create the groomer row with owner_account_id set
  insert into groomers (
    name,
    salon,
    address,
    lat,
    lng,
    phone,
    website,
    timezone,
    lead_time_hours,
    owner_account_id,
    location
  ) values (
    p_name,
    p_salon,
    p_address,
    p_lat,
    p_lng,
    p_phone,
    p_website,
    p_timezone,
    p_lead_time_hours,
    v_groomer_account_id,
    case
      when p_lat is not null and p_lng is not null
      then st_makepoint(p_lng, p_lat)::geography
      else null
    end
  )
  returning id into v_groomer_id;

  -- Create a verified owner membership
  insert into groomer_memberships (
    groomer_account_id,
    groomer_id,
    role,
    status
  ) values (
    v_groomer_account_id,
    v_groomer_id,
    'owner',
    'verified'
  );

  return v_groomer_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Step 3: Create refresh_groomer_services() RPC
-- ---------------------------------------------------------------------------
-- Recomputes groomers.services jsonb from active groomer_service_offerings.
-- This keeps the denormalized services column in sync with the structured
-- offerings table so that nearby_groomers() service-filter queries stay fresh.
--
-- Signature: refresh_groomer_services(p_groomer_id uuid) returns void

create or replace function refresh_groomer_services(p_groomer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update groomers
  set services = coalesce(
    jsonb_agg(distinct gso.service order by gso.service)
    filter (where gso.service is not null),
    '[]'::jsonb
  )
  from (
    select distinct service
    from groomer_service_offerings
    where groomer_id = p_groomer_id
  ) gso
  where id = p_groomer_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Step 4: Add UPDATE policy for verified groomers on their own row
-- ---------------------------------------------------------------------------

drop policy if exists "verified groomers update own row" on groomers;
create policy "verified groomers update own row"
  on groomers
  for update
  to authenticated
  using (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = groomers.id
        and gm.status = 'verified'
        and ga.auth_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = groomers.id
        and gm.status = 'verified'
        and ga.auth_user_id = (select auth.uid())
    )
  );
