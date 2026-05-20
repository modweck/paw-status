-- DANGER: PROTOTYPE ONLY.
-- This file allows public read/write on customer, dog, and appointment tables.
-- Do not apply this migration to a production Supabase project.
-- It replaces the auth-gated policies until real auth is wired up.
-- When real auth ships, drop these policies and restore production-safe policies.

do $$
begin
  raise exception 'Refusing to run db/02_relax_rls_prototype.sql. This prototype-only file opens customer, dog, and appointment tables to public read/write.';
end $$;

drop policy if exists "customers see own row" on customers;
drop policy if exists "customers update own row" on customers;
drop policy if exists "customers insert own row" on customers;
drop policy if exists "dogs belong to customer" on dogs;
drop policy if exists "appointments visible to dog owner" on appointments;
drop policy if exists "customers create own appointments" on appointments;

create policy "prototype_customers_all" on customers for all using (true) with check (true);
create policy "prototype_dogs_all" on dogs for all using (true) with check (true);
create policy "prototype_appointments_all" on appointments for all using (true) with check (true);

-- Unique constraint on phone so we can upsert customers by phone.
alter table customers add constraint customers_phone_unique unique (phone);
