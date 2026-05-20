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

drop policy if exists "verified groomers see owned appointment requests" on public.appointment_requests;
create policy "verified groomers see owned appointment requests"
on public.appointment_requests
for select
to authenticated
using (
  app_private.current_user_verified_for_groomer(groomer_id)
);

drop policy if exists "verified groomers update owned appointment request status" on public.appointment_requests;
create policy "verified groomers update owned appointment request status"
on public.appointment_requests
for update
to authenticated
using (
  app_private.current_user_verified_for_groomer(groomer_id)
)
with check (
  status in ('viewed', 'declined', 'needs_customer_action', 'external_handoff')
  and app_private.current_user_verified_for_groomer(groomer_id)
);

drop policy if exists "verified groomers see customers for owned requests" on public.customers;
create policy "verified groomers see customers for owned requests"
on public.customers
for select
to authenticated
using (
  app_private.current_user_verified_for_request_customer(id)
);

drop policy if exists "verified groomers see dogs for owned requests" on public.dogs;
create policy "verified groomers see dogs for owned requests"
on public.dogs
for select
to authenticated
using (
  app_private.current_user_verified_for_request_dog(id)
);
