-- Capture customer booking intent before groomers have live calendar ownership.
-- Confirmed appointments remain separate and should only be created after a
-- groomer or integration can actually confirm the slot.

create table if not exists appointment_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  dog_id uuid not null references dogs(id) on delete cascade,
  groomer_id uuid not null references groomers(id) on delete restrict,
  service text not null,
  preferred_windows jsonb not null default '[]'::jsonb,
  customer_notes text,
  status text not null default 'requested' check (
    status in ('requested', 'external_handoff', 'confirmed', 'declined', 'expired')
  ),
  external_booking_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint appointment_requests_preferred_windows_array check (
    jsonb_typeof(preferred_windows) = 'array'
  )
);

create index if not exists appointment_requests_customer_idx
on appointment_requests (customer_id, created_at desc);

create index if not exists appointment_requests_dog_idx
on appointment_requests (dog_id, created_at desc);

create index if not exists appointment_requests_groomer_idx
on appointment_requests (groomer_id, created_at desc);

alter table appointment_requests enable row level security;

revoke all on table appointment_requests from anon;
grant select, insert on table appointment_requests to authenticated;

drop policy if exists "customers see own appointment requests" on appointment_requests;
create policy "customers see own appointment requests"
on appointment_requests
for select
using (
  exists (
    select 1
    from dogs d
    join customers c on c.id = d.customer_id
    where c.id = appointment_requests.customer_id
      and d.id = appointment_requests.dog_id
      and c.auth_user_id = auth.uid()
  )
);

drop policy if exists "customers create own appointment requests" on appointment_requests;
create policy "customers create own appointment requests"
on appointment_requests
for insert
with check (
  exists (
    select 1
    from dogs d
    join customers c on c.id = d.customer_id
    where c.id = appointment_requests.customer_id
      and d.id = appointment_requests.dog_id
      and c.auth_user_id = auth.uid()
  )
);
