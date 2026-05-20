-- PawStatus baseline prototype schema.
-- This captures the intended starting schema from db/schema.sql.
-- Do not pair this with db/02_relax_rls_prototype.sql for production.

create extension if not exists postgis;

create table if not exists groomers (
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

create index if not exists groomers_location_idx on groomers using gist (location);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  name text,
  phone text,
  email text,
  onesignal_player_id text,
  created_at timestamptz default now()
);

create table if not exists dogs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  name text not null,
  breed text,
  size text check (size in ('toy','small','medium','large','xlarge')),
  notes text,
  created_at timestamptz default now()
);

do $$
begin
  if not exists (select 1 from pg_type where typname = 'appointment_status') then
    create type appointment_status as enum (
      'booked',
      'checked_in',
      'bathing',
      'drying',
      'almost_ready',
      'ready_for_pickup',
      'picked_up',
      'no_show',
      'cancelled'
    );
  end if;
end $$;

create table if not exists appointments (
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

create index if not exists appointments_groomer_date_idx on appointments (groomer_id, scheduled_at);
create index if not exists appointments_dog_idx on appointments (dog_id);

create or replace function nearby_groomers(user_lat double precision, user_lng double precision, radius_meters int default 5000)
returns table (
  id uuid,
  name text,
  salon text,
  address text,
  lat double precision,
  lng double precision,
  phone text,
  rating numeric,
  review_count int,
  price_base int,
  photo_url text,
  distance_meters double precision
) language sql stable as $$
  select g.id, g.name, g.salon, g.address, g.lat, g.lng,
         g.phone, g.rating, g.review_count, g.price_base, g.photo_url,
         st_distance(g.location, st_makepoint(user_lng, user_lat)::geography) as distance_meters
  from groomers g
  where st_dwithin(g.location, st_makepoint(user_lng, user_lat)::geography, radius_meters)
  order by distance_meters
  limit 50;
$$;

alter table groomers enable row level security;
alter table customers enable row level security;
alter table dogs enable row level security;
alter table appointments enable row level security;

drop policy if exists "groomers are public" on groomers;
create policy "groomers are public" on groomers for select using (true);

drop policy if exists "customers see own row" on customers;
create policy "customers see own row" on customers for select using (auth.uid() = auth_user_id);

drop policy if exists "customers update own row" on customers;
create policy "customers update own row" on customers for update using (auth.uid() = auth_user_id);

drop policy if exists "customers insert own row" on customers;
create policy "customers insert own row" on customers for insert with check (auth.uid() = auth_user_id);

drop policy if exists "dogs belong to customer" on dogs;
create policy "dogs belong to customer" on dogs for all using (
  exists (select 1 from customers c where c.id = dogs.customer_id and c.auth_user_id = auth.uid())
);

drop policy if exists "appointments visible to dog owner" on appointments;
create policy "appointments visible to dog owner" on appointments for select using (
  exists (
    select 1 from dogs d join customers c on c.id = d.customer_id
    where d.id = appointments.dog_id and c.auth_user_id = auth.uid()
  )
);

drop policy if exists "customers create own appointments" on appointments;
create policy "customers create own appointments" on appointments for insert with check (
  exists (
    select 1 from dogs d join customers c on c.id = d.customer_id
    where d.id = dog_id and c.auth_user_id = auth.uid()
  )
);
