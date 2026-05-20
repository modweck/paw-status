drop function if exists nearby_groomers(double precision, double precision, int);

create or replace function nearby_groomers(
  user_lat double precision,
  user_lng double precision,
  radius_meters int default 5000
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
         g.price_base,
         g.photo_url,
         st_distance(g.location, st_makepoint(user_lng, user_lat)::geography) as distance_meters
  from groomers g
  where st_dwithin(g.location, st_makepoint(user_lng, user_lat)::geography, radius_meters)
  order by distance_meters
  limit 50;
$$;
