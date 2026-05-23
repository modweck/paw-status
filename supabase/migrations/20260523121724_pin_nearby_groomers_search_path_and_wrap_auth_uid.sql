-- Supabase advisor cleanup, part 1.
--
-- Fixes two classes of findings from `supabase db advisors --linked`:
--   1. function_search_path_mutable on public.nearby_groomers
--   2. auth_rls_initplan on 9 customer-side RLS policies
--
-- Policy bodies are unchanged; only `auth.uid()` is wrapped in `(select auth.uid())`
-- so Postgres caches the result once per query instead of re-evaluating per row.
-- See https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- PostGIS-related findings (extension_in_public, rls_disabled_in_public on
-- spatial_ref_sys, anon/authenticated_security_definer on st_estimatedextent)
-- are intentionally out of scope and tracked separately.

-- 1. Pin the search_path on nearby_groomers so it cannot be hijacked by a
-- malicious schema entry. PostGIS currently lives in `public` (separately
-- tracked advisor finding). When PostGIS is later relocated to `extensions`,
-- this search_path will need to be updated to `public, extensions`.
alter function public.nearby_groomers(double precision, double precision, int, text)
  set search_path = public;

-- 2. Rewrap auth.uid() in (select ...) on the 9 customer-side policies.

-- public.customers
drop policy if exists "customers see own row" on public.customers;
create policy "customers see own row"
on public.customers
for select
using ((select auth.uid()) = auth_user_id);

drop policy if exists "customers update own row" on public.customers;
create policy "customers update own row"
on public.customers
for update
using ((select auth.uid()) = auth_user_id)
with check ((select auth.uid()) = auth_user_id);

drop policy if exists "customers insert own row" on public.customers;
create policy "customers insert own row"
on public.customers
for insert
with check ((select auth.uid()) = auth_user_id);

-- public.dogs
drop policy if exists "dogs belong to customer" on public.dogs;
create policy "dogs belong to customer"
on public.dogs
for all
using (
  exists (
    select 1
    from public.customers c
    where c.id = dogs.customer_id
      and c.auth_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.customers c
    where c.id = dogs.customer_id
      and c.auth_user_id = (select auth.uid())
  )
);

-- public.appointments
drop policy if exists "appointments visible to dog owner" on public.appointments;
create policy "appointments visible to dog owner"
on public.appointments
for select
using (
  exists (
    select 1
    from public.dogs d
    join public.customers c on c.id = d.customer_id
    where d.id = appointments.dog_id
      and c.auth_user_id = (select auth.uid())
  )
);

drop policy if exists "customers create own appointments" on public.appointments;
create policy "customers create own appointments"
on public.appointments
for insert
with check (
  exists (
    select 1
    from public.dogs d
    join public.customers c on c.id = d.customer_id
    where d.id = appointments.dog_id
      and c.auth_user_id = (select auth.uid())
  )
);

drop policy if exists "customers update own appointments" on public.appointments;
create policy "customers update own appointments"
on public.appointments
for update
using (
  exists (
    select 1
    from public.dogs d
    join public.customers c on c.id = d.customer_id
    where d.id = appointments.dog_id
      and c.auth_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.dogs d
    join public.customers c on c.id = d.customer_id
    where d.id = appointments.dog_id
      and c.auth_user_id = (select auth.uid())
  )
);

-- public.appointment_requests
drop policy if exists "customers see own appointment requests" on public.appointment_requests;
create policy "customers see own appointment requests"
on public.appointment_requests
for select
using (
  exists (
    select 1
    from public.dogs d
    join public.customers c on c.id = d.customer_id
    where c.id = appointment_requests.customer_id
      and d.id = appointment_requests.dog_id
      and c.auth_user_id = (select auth.uid())
  )
);

drop policy if exists "customers create own appointment requests" on public.appointment_requests;
create policy "customers create own appointment requests"
on public.appointment_requests
for insert
with check (
  exists (
    select 1
    from public.dogs d
    join public.customers c on c.id = d.customer_id
    where c.id = appointment_requests.customer_id
      and d.id = appointment_requests.dog_id
      and c.auth_user_id = (select auth.uid())
  )
);
