-- PawStatus schema
-- Paste this whole file into Supabase SQL Editor and click "Run".

create extension if not exists postgis;

create table groomers (
  id uuid primary key default gen_random_uuid(),
  google_place_id text unique,
  name text not null,
  salon text,
  address text,
  lat double precision,
  lng double precision,
  location geography(point, 4326),
  phone text,
  website text,
  rating numeric(2,1),
  review_count int,
  hours jsonb,
  services jsonb default '[]'::jsonb,
  price_base int,
  photo_url text,
  created_at timestamptz default now()
);

create index groomers_location_idx on groomers using gist (location);

create table customers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  name text,
  phone text,
  email text,
  username text,
  onesignal_player_id text,
  created_at timestamptz default now()
);

create table dogs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  name text not null,
  breed text,
  size text check (size in ('toy','small','medium','large','xlarge')),
  birthdate date,
  weight_lbs numeric(5,1) check (weight_lbs is null or weight_lbs > 0),
  coat_type text,
  temperament text,
  allergies text,
  preferred_service_id text,
  preferred_groomer_id uuid references groomers(id) on delete set null,
  preferred_groomer_name text,
  last_groomed_at date,
  grooming_interval_weeks int check (
    grooming_interval_weeks is null
    or grooming_interval_weeks between 1 and 52
  ),
  notes text,
  created_at timestamptz default now()
);

create type appointment_status as enum (
  'booked', 'checked_in', 'bathing', 'drying', 'almost_ready', 'ready_for_pickup', 'picked_up', 'no_show', 'cancelled'
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid references dogs(id) on delete cascade,
  groomer_id uuid references groomers(id) on delete restrict,
  service text not null,
  price int,
  scheduled_at timestamptz not null,
  status appointment_status not null default 'booked',
  status_updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create index appointments_groomer_date_idx on appointments (groomer_id, scheduled_at);
create index appointments_dog_idx on appointments (dog_id);
create index dogs_preferred_groomer_idx on dogs (preferred_groomer_id);

create table appointment_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  dog_id uuid not null references dogs(id) on delete cascade,
  groomer_id uuid not null references groomers(id) on delete restrict,
  service text not null,
  preferred_windows jsonb not null default '[]'::jsonb,
  customer_notes text,
  status text not null default 'requested' check (
    status in (
      'requested',
      'external_handoff',
      'viewed',
      'needs_customer_action',
      'confirmed',
      'declined',
      'expired'
    )
  ),
  external_booking_url text,
  guest_claim_token_hash text,
  guest_claim_expires_at timestamptz,
  guest_claimed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint appointment_requests_preferred_windows_array check (
    jsonb_typeof(preferred_windows) = 'array'
  )
);

create index appointment_requests_customer_idx on appointment_requests (customer_id, created_at desc);
create index appointment_requests_dog_idx on appointment_requests (dog_id, created_at desc);
create index appointment_requests_groomer_idx on appointment_requests (groomer_id, created_at desc);
create unique index appointment_requests_guest_claim_token_hash_idx
on appointment_requests (guest_claim_token_hash)
where guest_claim_token_hash is not null;

create table groomer_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table groomer_memberships (
  id uuid primary key default gen_random_uuid(),
  groomer_account_id uuid not null references groomer_accounts(id) on delete cascade,
  groomer_id uuid not null references groomers(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'manager', 'staff')),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (groomer_account_id, groomer_id)
);

create table booking_channels (
  id uuid primary key default gen_random_uuid(),
  groomer_id uuid not null references groomers(id) on delete cascade,
  provider text not null check (
    provider in (
      'square',
      'google_business_profile',
      'google_calendar',
      'calendly',
      'acuity',
      'fresha',
      'vagaro',
      'booksy',
      'website',
      'phone',
      'email'
    )
  ),
  label text,
  url text,
  phone text,
  email text,
  priority int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_channels_has_handoff check (
    nullif(url, '') is not null
    or nullif(phone, '') is not null
    or nullif(email, '') is not null
  )
);

create table calendar_connections (
  id uuid primary key default gen_random_uuid(),
  groomer_account_id uuid not null references groomer_accounts(id) on delete cascade,
  groomer_id uuid references groomers(id) on delete cascade,
  provider text not null check (
    provider in ('google_calendar', 'square', 'calendly', 'acuity')
  ),
  status text not null default 'not_connected' check (
    status in ('not_connected', 'pending', 'connected', 'error', 'revoked')
  ),
  external_account_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (groomer_account_id, groomer_id, provider)
);

create index groomer_memberships_account_idx on groomer_memberships (groomer_account_id, status);
create index groomer_memberships_groomer_idx on groomer_memberships (groomer_id, status);
create index booking_channels_groomer_idx on booking_channels (groomer_id, is_active, priority);
create index calendar_connections_account_idx on calendar_connections (groomer_account_id, status);

create or replace function nearby_groomers(
  user_lat double precision,
  user_lng double precision,
  radius_meters int default 5000,
  service_id text default null
)
returns table (
  id uuid, google_place_id text, name text, salon text, address text,
  lat double precision, lng double precision,
  phone text, website text, rating numeric, review_count int, services jsonb,
  price_base int, photo_url text,
  distance_meters double precision
) language sql stable as $$
  select g.id, g.google_place_id, g.name, g.salon, g.address, g.lat, g.lng,
         g.phone, g.website, g.rating, g.review_count, coalesce(g.services, '[]'::jsonb) as services, g.price_base, g.photo_url,
         st_distance(g.location, st_makepoint(user_lng, user_lat)::geography) as distance_meters
  from groomers g
  where st_dwithin(g.location, st_makepoint(user_lng, user_lat)::geography, radius_meters)
    and (
      service_id is null
      or service_id = ''
      or coalesce(g.services, '[]'::jsonb) ? service_id
    )
  order by distance_meters
  limit 50;
$$;

alter table groomers enable row level security;
alter table customers enable row level security;
alter table dogs enable row level security;
alter table appointments enable row level security;
alter table appointment_requests enable row level security;
alter table groomer_accounts enable row level security;
alter table groomer_memberships enable row level security;
alter table booking_channels enable row level security;
alter table calendar_connections enable row level security;

revoke all on table groomer_accounts from anon;
revoke all on table groomer_memberships from anon;
revoke all on table booking_channels from anon;
revoke all on table calendar_connections from anon;

grant select, insert, update on table groomer_accounts to authenticated;
grant select, insert on table groomer_memberships to authenticated;
grant select on table booking_channels to authenticated;
grant select on table calendar_connections to authenticated;
revoke update on table appointment_requests from authenticated;
grant update (status, external_booking_url, updated_at) on table appointment_requests to authenticated;

create schema if not exists app_private;
grant usage on schema app_private to authenticated;

create or replace function app_private.current_user_verified_for_groomer(target_groomer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.groomer_memberships gm
    join public.groomer_accounts ga on ga.id = gm.groomer_account_id
    where gm.groomer_id = target_groomer_id
      and gm.status = 'verified'
      and ga.auth_user_id = (select auth.uid())
  );
$$;

create or replace function app_private.current_user_verified_for_request_customer(target_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.appointment_requests ar
    where ar.customer_id = target_customer_id
      and app_private.current_user_verified_for_groomer(ar.groomer_id)
  );
$$;

create or replace function app_private.current_user_verified_for_request_dog(target_dog_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.appointment_requests ar
    where ar.dog_id = target_dog_id
      and app_private.current_user_verified_for_groomer(ar.groomer_id)
  );
$$;

revoke all on function app_private.current_user_verified_for_groomer(uuid) from public;
revoke all on function app_private.current_user_verified_for_request_customer(uuid) from public;
revoke all on function app_private.current_user_verified_for_request_dog(uuid) from public;

grant execute on function app_private.current_user_verified_for_groomer(uuid) to authenticated;
grant execute on function app_private.current_user_verified_for_request_customer(uuid) to authenticated;
grant execute on function app_private.current_user_verified_for_request_dog(uuid) to authenticated;

create policy "groomers are public" on groomers for select using (true);

create policy "customers see own row" on customers for select using (auth.uid() = auth_user_id);
create policy "customers update own row" on customers
for update
using (auth.uid() = auth_user_id)
with check (auth.uid() = auth_user_id);
create policy "customers insert own row" on customers for insert with check (auth.uid() = auth_user_id);

create policy "dogs belong to customer" on dogs for all using (
  exists (select 1 from customers c where c.id = dogs.customer_id and c.auth_user_id = auth.uid())
)
with check (
  exists (select 1 from customers c where c.id = dogs.customer_id and c.auth_user_id = auth.uid())
);

create policy "appointments visible to dog owner" on appointments for select using (
  exists (
    select 1 from dogs d join customers c on c.id = d.customer_id
    where d.id = appointments.dog_id and c.auth_user_id = auth.uid()
  )
);
create policy "customers create own appointments" on appointments for insert with check (
  exists (
    select 1 from dogs d join customers c on c.id = d.customer_id
    where d.id = dog_id and c.auth_user_id = auth.uid()
  )
);

create policy "customers see own appointment requests" on appointment_requests for select using (
  exists (
    select 1 from dogs d join customers c on c.id = d.customer_id
    where c.id = appointment_requests.customer_id
      and d.id = appointment_requests.dog_id
      and c.auth_user_id = auth.uid()
  )
);
create policy "customers create own appointment requests" on appointment_requests for insert with check (
  exists (
    select 1 from dogs d join customers c on c.id = d.customer_id
    where c.id = appointment_requests.customer_id
      and d.id = appointment_requests.dog_id
      and c.auth_user_id = auth.uid()
  )
);

create policy "groomer accounts select own row" on groomer_accounts
for select
to authenticated
using ((select auth.uid()) = auth_user_id);

create policy "groomer accounts insert own row" on groomer_accounts
for insert
to authenticated
with check ((select auth.uid()) = auth_user_id);

create policy "groomer accounts update own row" on groomer_accounts
for update
to authenticated
using ((select auth.uid()) = auth_user_id)
with check ((select auth.uid()) = auth_user_id);

create policy "groomer memberships select own account rows" on groomer_memberships
for select
to authenticated
using (
  exists (
    select 1 from groomer_accounts ga
    where ga.id = groomer_memberships.groomer_account_id
      and ga.auth_user_id = (select auth.uid())
  )
);

create policy "groomer memberships request own pending claim" on groomer_memberships
for insert
to authenticated
with check (
  status = 'pending'
  and exists (
    select 1 from groomer_accounts ga
    where ga.id = groomer_memberships.groomer_account_id
      and ga.auth_user_id = (select auth.uid())
  )
);

create policy "verified groomers select booking channels" on booking_channels
for select
to authenticated
using (
  exists (
    select 1
    from groomer_memberships gm
    join groomer_accounts ga on ga.id = gm.groomer_account_id
    where gm.groomer_id = booking_channels.groomer_id
      and gm.status = 'verified'
      and ga.auth_user_id = (select auth.uid())
  )
);

create policy "groomer accounts select own calendar connections" on calendar_connections
for select
to authenticated
using (
  exists (
    select 1 from groomer_accounts ga
    where ga.id = calendar_connections.groomer_account_id
      and ga.auth_user_id = (select auth.uid())
  )
);

create policy "verified groomers see owned appointment requests" on appointment_requests
for select
to authenticated
using (
  app_private.current_user_verified_for_groomer(groomer_id)
);

create policy "verified groomers update owned appointment request status" on appointment_requests
for update
to authenticated
using (
  app_private.current_user_verified_for_groomer(groomer_id)
)
with check (
  status in ('viewed', 'declined', 'needs_customer_action', 'external_handoff')
  and app_private.current_user_verified_for_groomer(groomer_id)
);

create policy "verified groomers see customers for owned requests" on customers
for select
to authenticated
using (
  app_private.current_user_verified_for_request_customer(id)
);

create policy "verified groomers see dogs for owned requests" on dogs
for select
to authenticated
using (
  app_private.current_user_verified_for_request_dog(id)
);
