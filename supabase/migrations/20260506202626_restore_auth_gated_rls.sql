-- Restore auth-gated RLS after the prototype-open policy phase.
--
-- Do not apply this to the live project until the frontend uses Supabase Auth.
-- Applying it before auth is wired will break current customer booking flows.

alter table groomers enable row level security;
alter table customers enable row level security;
alter table dogs enable row level security;
alter table appointments enable row level security;

-- Remove prototype-open policies from db/02_relax_rls_prototype.sql.
drop policy if exists "prototype_customers_all" on customers;
drop policy if exists "prototype_dogs_all" on dogs;
drop policy if exists "prototype_appointments_all" on appointments;

-- Groomers can remain public for search/browse in the prototype model.
drop policy if exists "groomers are public" on groomers;
create policy "groomers are public"
on groomers
for select
using (true);

-- Customers can only access their own row.
drop policy if exists "customers see own row" on customers;
create policy "customers see own row"
on customers
for select
using (auth.uid() = auth_user_id);

drop policy if exists "customers update own row" on customers;
create policy "customers update own row"
on customers
for update
using (auth.uid() = auth_user_id)
with check (auth.uid() = auth_user_id);

drop policy if exists "customers insert own row" on customers;
create policy "customers insert own row"
on customers
for insert
with check (auth.uid() = auth_user_id);

-- Dogs belong to a customer row owned by the logged-in user.
drop policy if exists "dogs belong to customer" on dogs;
create policy "dogs belong to customer"
on dogs
for all
using (
  exists (
    select 1
    from customers c
    where c.id = dogs.customer_id
      and c.auth_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from customers c
    where c.id = dogs.customer_id
      and c.auth_user_id = auth.uid()
  )
);

-- Customers can read appointments for their dogs.
drop policy if exists "appointments visible to dog owner" on appointments;
create policy "appointments visible to dog owner"
on appointments
for select
using (
  exists (
    select 1
    from dogs d
    join customers c on c.id = d.customer_id
    where d.id = appointments.dog_id
      and c.auth_user_id = auth.uid()
  )
);

-- Customers can create appointments for their dogs.
drop policy if exists "customers create own appointments" on appointments;
create policy "customers create own appointments"
on appointments
for insert
with check (
  exists (
    select 1
    from dogs d
    join customers c on c.id = d.customer_id
    where d.id = appointments.dog_id
      and c.auth_user_id = auth.uid()
  )
);

-- Customers can reschedule/cancel their own appointments in this interim model.
-- A later groomer/salon migration should replace direct status updates with
-- groomer-owned policies or a server-side status transition function.
drop policy if exists "customers update own appointments" on appointments;
create policy "customers update own appointments"
on appointments
for update
using (
  exists (
    select 1
    from dogs d
    join customers c on c.id = d.customer_id
    where d.id = appointments.dog_id
      and c.auth_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from dogs d
    join customers c on c.id = d.customer_id
    where d.id = appointments.dog_id
      and c.auth_user_id = auth.uid()
  )
);
