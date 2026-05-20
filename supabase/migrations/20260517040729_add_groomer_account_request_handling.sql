-- Add groomer-owned request handling without opening confirmed appointments.
-- Calendar/provider rows are safe metadata only; OAuth tokens belong in a later
-- server-side integration layer.

create table if not exists groomer_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists groomer_memberships (
  id uuid primary key default gen_random_uuid(),
  groomer_account_id uuid not null references groomer_accounts(id) on delete cascade,
  groomer_id uuid not null references groomers(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'manager', 'staff')),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (groomer_account_id, groomer_id)
);

create table if not exists booking_channels (
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

create table if not exists calendar_connections (
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

create index if not exists groomer_memberships_account_idx
on groomer_memberships (groomer_account_id, status);

create index if not exists groomer_memberships_groomer_idx
on groomer_memberships (groomer_id, status);

create index if not exists booking_channels_groomer_idx
on booking_channels (groomer_id, is_active, priority);

create index if not exists calendar_connections_account_idx
on calendar_connections (groomer_account_id, status);

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

drop policy if exists "groomer accounts select own row" on groomer_accounts;
create policy "groomer accounts select own row"
on groomer_accounts
for select
to authenticated
using ((select auth.uid()) = auth_user_id);

drop policy if exists "groomer accounts insert own row" on groomer_accounts;
create policy "groomer accounts insert own row"
on groomer_accounts
for insert
to authenticated
with check ((select auth.uid()) = auth_user_id);

drop policy if exists "groomer accounts update own row" on groomer_accounts;
create policy "groomer accounts update own row"
on groomer_accounts
for update
to authenticated
using ((select auth.uid()) = auth_user_id)
with check ((select auth.uid()) = auth_user_id);

drop policy if exists "groomer memberships select own account rows" on groomer_memberships;
create policy "groomer memberships select own account rows"
on groomer_memberships
for select
to authenticated
using (
  exists (
    select 1
    from groomer_accounts ga
    where ga.id = groomer_memberships.groomer_account_id
      and ga.auth_user_id = (select auth.uid())
  )
);

drop policy if exists "groomer memberships request own pending claim" on groomer_memberships;
create policy "groomer memberships request own pending claim"
on groomer_memberships
for insert
to authenticated
with check (
  status = 'pending'
  and exists (
    select 1
    from groomer_accounts ga
    where ga.id = groomer_memberships.groomer_account_id
      and ga.auth_user_id = (select auth.uid())
  )
);

drop policy if exists "verified groomers select booking channels" on booking_channels;
create policy "verified groomers select booking channels"
on booking_channels
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

drop policy if exists "groomer accounts select own calendar connections" on calendar_connections;
create policy "groomer accounts select own calendar connections"
on calendar_connections
for select
to authenticated
using (
  exists (
    select 1
    from groomer_accounts ga
    where ga.id = calendar_connections.groomer_account_id
      and ga.auth_user_id = (select auth.uid())
  )
);

alter table appointment_requests
drop constraint if exists appointment_requests_status_check;

alter table appointment_requests
add constraint appointment_requests_status_check check (
  status in (
    'requested',
    'external_handoff',
    'viewed',
    'needs_customer_action',
    'confirmed',
    'declined',
    'expired'
  )
);

grant update (status, external_booking_url, updated_at)
on table appointment_requests
to authenticated;

drop policy if exists "verified groomers see owned appointment requests" on appointment_requests;
create policy "verified groomers see owned appointment requests"
on appointment_requests
for select
to authenticated
using (
  exists (
    select 1
    from groomer_memberships gm
    join groomer_accounts ga on ga.id = gm.groomer_account_id
    where gm.groomer_id = appointment_requests.groomer_id
      and gm.status = 'verified'
      and ga.auth_user_id = (select auth.uid())
  )
);

drop policy if exists "verified groomers update owned appointment request status" on appointment_requests;
create policy "verified groomers update owned appointment request status"
on appointment_requests
for update
to authenticated
using (
  exists (
    select 1
    from groomer_memberships gm
    join groomer_accounts ga on ga.id = gm.groomer_account_id
    where gm.groomer_id = appointment_requests.groomer_id
      and gm.status = 'verified'
      and ga.auth_user_id = (select auth.uid())
  )
)
with check (
  status in ('viewed', 'declined', 'needs_customer_action', 'external_handoff')
  and exists (
    select 1
    from groomer_memberships gm
    join groomer_accounts ga on ga.id = gm.groomer_account_id
    where gm.groomer_id = appointment_requests.groomer_id
      and gm.status = 'verified'
      and ga.auth_user_id = (select auth.uid())
  )
);

drop policy if exists "verified groomers see customers for owned requests" on customers;
create policy "verified groomers see customers for owned requests"
on customers
for select
to authenticated
using (
  exists (
    select 1
    from appointment_requests ar
    join groomer_memberships gm on gm.groomer_id = ar.groomer_id
    join groomer_accounts ga on ga.id = gm.groomer_account_id
    where ar.customer_id = customers.id
      and gm.status = 'verified'
      and ga.auth_user_id = (select auth.uid())
  )
);

drop policy if exists "verified groomers see dogs for owned requests" on dogs;
create policy "verified groomers see dogs for owned requests"
on dogs
for select
to authenticated
using (
  exists (
    select 1
    from appointment_requests ar
    join groomer_memberships gm on gm.groomer_id = ar.groomer_id
    join groomer_accounts ga on ga.id = gm.groomer_account_id
    where ar.dog_id = dogs.id
      and gm.status = 'verified'
      and ga.auth_user_id = (select auth.uid())
  )
);
