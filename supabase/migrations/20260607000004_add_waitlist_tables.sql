-- Phase 4 Waitlist Infrastructure
--
-- This migration adds the core waitlist system: customers can join global/geo
-- waitlists, and groomers can offer specific time slots to waiting customers.
--
-- Tables:
--   waitlist_entries  - Customer's request to be on a waitlist (global or per-groomer)
--   waitlist_offers   - Specific slot offered by a groomer to a waiting customer
--
-- RLS summary:
--   waitlist_entries  → customers can SELECT/INSERT/UPDATE/DELETE their own;
--                       verified groomers can SELECT entries targeting their groomer_id
--   waitlist_offers   → customers can SELECT offers for their entries;
--                       verified groomers can SELECT offers for their groomer_id;
--                       no client INSERT (created by server-side RPCs only)

-- ---------------------------------------------------------------------------
-- waitlist_entries
-- ---------------------------------------------------------------------------
-- Represents a customer's request to join a waitlist.
-- If groomer_id is null, this is a global/geo waitlist entry (match by location + radius).
-- If groomer_id is set, this is a specific groomer's waitlist.
--
-- Status: 'active' (waiting), 'offered' (offer made), 'fulfilled' (booked), 'cancelled'

create table if not exists waitlist_entries (
  id              uuid           primary key default gen_random_uuid(),
  customer_id     uuid           not null references customers(id) on delete cascade,
  groomer_id      uuid           references groomers(id) on delete cascade,
  service_id      text           not null,
  status          text           not null default 'active' check (
    status in ('active', 'offered', 'fulfilled', 'cancelled')
  ),
  location        geography(Point, 4326),
  radius_m        int,
  created_at      timestamptz    not null default now()
);

create index if not exists waitlist_entries_customer_idx
  on waitlist_entries (customer_id, created_at desc);

create index if not exists waitlist_entries_groomer_idx
  on waitlist_entries (groomer_id, status);

create index if not exists waitlist_entries_location_idx
  on waitlist_entries using gist (location)
  where location is not null;

alter table waitlist_entries enable row level security;

revoke all on table waitlist_entries from anon;
grant select, insert, update, delete on table waitlist_entries to authenticated;

drop policy if exists "customers see own waitlist entries" on waitlist_entries;
create policy "customers see own waitlist entries"
  on waitlist_entries
  for select
  to authenticated
  using (
    customer_id = (select id from customers where auth_user_id = auth.uid())
  );

drop policy if exists "customers insert own waitlist entries" on waitlist_entries;
create policy "customers insert own waitlist entries"
  on waitlist_entries
  for insert
  to authenticated
  with check (
    customer_id = (select id from customers where auth_user_id = auth.uid())
  );

drop policy if exists "customers update own waitlist entries" on waitlist_entries;
create policy "customers update own waitlist entries"
  on waitlist_entries
  for update
  to authenticated
  using (
    customer_id = (select id from customers where auth_user_id = auth.uid())
  )
  with check (
    customer_id = (select id from customers where auth_user_id = auth.uid())
  );

drop policy if exists "customers delete own waitlist entries" on waitlist_entries;
create policy "customers delete own waitlist entries"
  on waitlist_entries
  for delete
  to authenticated
  using (
    customer_id = (select id from customers where auth_user_id = auth.uid())
  );

drop policy if exists "verified groomers see targeting entries" on waitlist_entries;
create policy "verified groomers see targeting entries"
  on waitlist_entries
  for select
  to authenticated
  using (
    groomer_id is not null
    and exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = waitlist_entries.groomer_id
        and gm.status = 'verified'
        and ga.auth_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- waitlist_offers
-- ---------------------------------------------------------------------------
-- A specific time slot (with duration and expiration) offered by a groomer to
-- a waiting customer. Once a customer claims an offer, the corresponding
-- waitlist_entry moves to 'fulfilled' status.
--
-- Status: 'pending' (not yet claimed), 'claimed' (accepted by customer), 'expired' (time passed)

create table if not exists waitlist_offers (
  id              uuid           primary key default gen_random_uuid(),
  entry_id        uuid           not null references waitlist_entries(id) on delete cascade,
  groomer_id      uuid           not null references groomers(id) on delete cascade,
  service_id      text           not null,
  slot_at         timestamptz    not null,
  duration_minutes int           not null,
  status          text           not null default 'pending' check (
    status in ('pending', 'claimed', 'expired')
  ),
  expires_at      timestamptz    not null,
  created_at      timestamptz    not null default now()
);

create index if not exists waitlist_offers_entry_idx
  on waitlist_offers (entry_id, status);

create index if not exists waitlist_offers_groomer_idx
  on waitlist_offers (groomer_id, status);

create index if not exists waitlist_offers_slot_idx
  on waitlist_offers (slot_at);

create index if not exists waitlist_offers_expires_idx
  on waitlist_offers (expires_at);

alter table waitlist_offers enable row level security;

revoke all on table waitlist_offers from anon;
grant select on table waitlist_offers to authenticated;

drop policy if exists "customers see own entry offers" on waitlist_offers;
create policy "customers see own entry offers"
  on waitlist_offers
  for select
  to authenticated
  using (
    exists (
      select 1
      from waitlist_entries we
      join customers c on c.id = we.customer_id
      where we.id = waitlist_offers.entry_id
        and c.auth_user_id = auth.uid()
    )
  );

drop policy if exists "verified groomers see own offers" on waitlist_offers;
create policy "verified groomers see own offers"
  on waitlist_offers
  for select
  to authenticated
  using (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = waitlist_offers.groomer_id
        and gm.status = 'verified'
        and ga.auth_user_id = auth.uid()
    )
  );
