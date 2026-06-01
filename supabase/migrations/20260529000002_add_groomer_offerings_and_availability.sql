-- Structured service catalog and availability tables that replace the
-- unstructured services JSONB blob on groomers with queryable, priceable
-- offerings and a machine-readable weekly schedule plus ad-hoc time off.
--
-- RLS summary for all three tables:
--   anon / customers       → SELECT only (where table is public-readable)
--   verified groomer       → INSERT / UPDATE / DELETE their own rows only
--   groomer_time_off reads → restricted to the owning verified groomer

-- ---------------------------------------------------------------------------
-- groomer_offerings
-- ---------------------------------------------------------------------------
-- One row per bookable service variant a groomer offers (e.g. "Bath & Brush
-- for a Large dog"). size_modifier_json and breed_modifier_json are optional
-- add-on price maps keyed by size/breed slug so a single offering row can
-- represent a price schedule without explosive row counts.

create table if not exists groomer_offerings (
  id                  uuid         primary key default gen_random_uuid(),
  groomer_id          uuid         not null references groomers(id) on delete cascade,
  service             text         not null,
  duration_minutes    int          not null,
  base_price_cents    int,
  size_modifier_json  jsonb,
  breed_modifier_json jsonb,
  created_at          timestamptz  not null default now()
);

create index if not exists groomer_offerings_groomer_idx
  on groomer_offerings (groomer_id);

alter table groomer_offerings enable row level security;

-- Public read: customers (including anonymous) need to browse service menus.
revoke all on table groomer_offerings from anon, authenticated;
grant select                              on table groomer_offerings to anon, authenticated;
grant insert, update, delete              on table groomer_offerings to authenticated;

drop policy if exists "groomer_offerings public select" on groomer_offerings;
create policy "groomer_offerings public select"
  on groomer_offerings
  for select
  using (true);

drop policy if exists "verified groomers insert own offerings" on groomer_offerings;
create policy "verified groomers insert own offerings"
  on groomer_offerings
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = groomer_offerings.groomer_id
        and gm.status = 'verified'
        and ga.auth_user_id = (select auth.uid())
    )
  );

drop policy if exists "verified groomers update own offerings" on groomer_offerings;
create policy "verified groomers update own offerings"
  on groomer_offerings
  for update
  to authenticated
  using (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = groomer_offerings.groomer_id
        and gm.status = 'verified'
        and ga.auth_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = groomer_offerings.groomer_id
        and gm.status = 'verified'
        and ga.auth_user_id = (select auth.uid())
    )
  );

drop policy if exists "verified groomers delete own offerings" on groomer_offerings;
create policy "verified groomers delete own offerings"
  on groomer_offerings
  for delete
  to authenticated
  using (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = groomer_offerings.groomer_id
        and gm.status = 'verified'
        and ga.auth_user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- groomer_weekly_hours
-- ---------------------------------------------------------------------------
-- Recurring weekly availability windows. day_of_week follows ISO convention:
-- 0 = Sunday … 6 = Saturday. A groomer can have multiple open windows on the
-- same day (split shift). The uniqueness / no-overlap constraint between
-- windows for the same groomer+day is enforced at the application layer.

create table if not exists groomer_weekly_hours (
  id              uuid        primary key default gen_random_uuid(),
  groomer_id      uuid        not null references groomers(id) on delete cascade,
  day_of_week     smallint    not null check (day_of_week between 0 and 6),
  open_time       time        not null,
  close_time      time        not null,
  constraint groomer_weekly_hours_open_before_close check (open_time < close_time)
);

create index if not exists groomer_weekly_hours_groomer_idx
  on groomer_weekly_hours (groomer_id, day_of_week);

alter table groomer_weekly_hours enable row level security;

-- Public read: browsing customers need to see when a groomer is open.
revoke all on table groomer_weekly_hours from anon, authenticated;
grant select                           on table groomer_weekly_hours to anon, authenticated;
grant insert, update, delete           on table groomer_weekly_hours to authenticated;

drop policy if exists "groomer_weekly_hours public select" on groomer_weekly_hours;
create policy "groomer_weekly_hours public select"
  on groomer_weekly_hours
  for select
  using (true);

drop policy if exists "verified groomers insert own weekly hours" on groomer_weekly_hours;
create policy "verified groomers insert own weekly hours"
  on groomer_weekly_hours
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = groomer_weekly_hours.groomer_id
        and gm.status = 'verified'
        and ga.auth_user_id = (select auth.uid())
    )
  );

drop policy if exists "verified groomers update own weekly hours" on groomer_weekly_hours;
create policy "verified groomers update own weekly hours"
  on groomer_weekly_hours
  for update
  to authenticated
  using (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = groomer_weekly_hours.groomer_id
        and gm.status = 'verified'
        and ga.auth_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = groomer_weekly_hours.groomer_id
        and gm.status = 'verified'
        and ga.auth_user_id = (select auth.uid())
    )
  );

drop policy if exists "verified groomers delete own weekly hours" on groomer_weekly_hours;
create policy "verified groomers delete own weekly hours"
  on groomer_weekly_hours
  for delete
  to authenticated
  using (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = groomer_weekly_hours.groomer_id
        and gm.status = 'verified'
        and ga.auth_user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- groomer_time_off
-- ---------------------------------------------------------------------------
-- Ad-hoc blocks of unavailability (vacations, holidays, maintenance days).
-- Rows here are subtracted from the weekly hours schedule when computing
-- open slots. Reads are restricted to the owning groomer; customers only
-- see the effect (no available slots) rather than the raw time-off entries.

create table if not exists groomer_time_off (
  id          uuid         primary key default gen_random_uuid(),
  groomer_id  uuid         not null references groomers(id) on delete cascade,
  start_at    timestamptz  not null,
  end_at      timestamptz  not null,
  constraint groomer_time_off_start_before_end check (start_at < end_at)
);

create index if not exists groomer_time_off_groomer_range_idx
  on groomer_time_off (groomer_id, start_at, end_at);

alter table groomer_time_off enable row level security;

-- Restricted read: only the owning verified groomer should see their own
-- time-off records. Customers never need to read raw time-off rows.
revoke all on table groomer_time_off from anon, authenticated;
grant select, insert, update, delete on table groomer_time_off to authenticated;

drop policy if exists "verified groomers select own time off" on groomer_time_off;
create policy "verified groomers select own time off"
  on groomer_time_off
  for select
  to authenticated
  using (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = groomer_time_off.groomer_id
        and gm.status = 'verified'
        and ga.auth_user_id = (select auth.uid())
    )
  );

drop policy if exists "verified groomers insert own time off" on groomer_time_off;
create policy "verified groomers insert own time off"
  on groomer_time_off
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = groomer_time_off.groomer_id
        and gm.status = 'verified'
        and ga.auth_user_id = (select auth.uid())
    )
  );

drop policy if exists "verified groomers update own time off" on groomer_time_off;
create policy "verified groomers update own time off"
  on groomer_time_off
  for update
  to authenticated
  using (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = groomer_time_off.groomer_id
        and gm.status = 'verified'
        and ga.auth_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = groomer_time_off.groomer_id
        and gm.status = 'verified'
        and ga.auth_user_id = (select auth.uid())
    )
  );

drop policy if exists "verified groomers delete own time off" on groomer_time_off;
create policy "verified groomers delete own time off"
  on groomer_time_off
  for delete
  to authenticated
  using (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = groomer_time_off.groomer_id
        and gm.status = 'verified'
        and ga.auth_user_id = (select auth.uid())
    )
  );
