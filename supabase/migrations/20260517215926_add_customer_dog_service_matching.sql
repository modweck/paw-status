alter table dogs
  add column if not exists birthdate date,
  add column if not exists weight_lbs numeric(5,1) check (weight_lbs is null or weight_lbs > 0),
  add column if not exists coat_type text,
  add column if not exists temperament text,
  add column if not exists allergies text,
  add column if not exists last_groomed_at date,
  add column if not exists grooming_interval_weeks int check (
    grooming_interval_weeks is null
    or grooming_interval_weeks between 1 and 52
  );

drop function if exists nearby_groomers(double precision, double precision, int);
drop function if exists nearby_groomers(double precision, double precision, int, text);

create or replace function nearby_groomers(
  user_lat double precision,
  user_lng double precision,
  radius_meters int default 5000,
  service_id text default null
)
returns table (
  id uuid,
  google_place_id text,
  name text,
  salon text,
  address text,
  lat double precision,
  lng double precision,
  phone text,
  website text,
  rating numeric,
  review_count int,
  services jsonb,
  price_base int,
  photo_url text,
  distance_meters double precision
) language sql stable as $$
  select g.id,
         g.google_place_id,
         g.name,
         g.salon,
         g.address,
         g.lat,
         g.lng,
         g.phone,
         g.website,
         g.rating,
         g.review_count,
         coalesce(g.services, '[]'::jsonb) as services,
         g.price_base,
         g.photo_url,
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
