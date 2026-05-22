# Supabase and Postgres Terms

These notes distinguish database terms from Supabase-specific product behavior.

## Mostly Postgres Terms

- `Postgres` / `PostgreSQL`: the database engine.
- `schema`: a namespace inside a database. It is similar to a folder for tables,
  views, functions, and extension objects.
- `public`: the default Postgres schema created in most databases.
- `extension`: a package installed into Postgres to add capabilities.
- `PostGIS`: a Postgres extension for geospatial types and functions.
- `gis`: not a special built-in term. It is a common schema name teams use for
  geographic objects or PostGIS installs.

## Mostly Supabase Terms

- `Supabase`: the hosted app platform around Postgres: Auth, REST API,
  Realtime, Storage, Edge Functions, dashboard, and advisors.
- `PostgREST` / Data API: the REST API Supabase exposes over selected database
  schemas.
- `exposed schema`: a schema Supabase makes available through the Data API.
  `public` is exposed by default in standard projects.
- `RLS`: Row Level Security. This is a Postgres feature, but Supabase leans on it
  heavily because exposed tables can otherwise be reachable through the API.
- `anon`, `authenticated`, `service_role`: Supabase roles used by its API/auth
  layer.
- `publishable key` / `anon key`: browser-safe project key, assuming RLS and
  grants are correct.
- `secret key` / `service role key`: server-only key that can bypass normal user
  restrictions and must never ship to browsers.
- `database advisors`: Supabase lint checks that flag security and performance
  issues.

## Mixed Terms

- `extensions` can mean a normal Postgres schema named `extensions`, but in
  Supabase it is also the recommended kind of place to install extension
  objects so they do not sit in the public API surface.
- `spatial_ref_sys` is a PostGIS metadata table. The table itself comes from
  PostGIS/Postgres, but the warning about it being public comes from Supabase's
  exposed-schema advisor.

## PawStatus PostGIS Warning

PawStatus uses PostGIS-style geospatial search for `nearby_groomers`. The live
project currently has PostGIS installed in `public`, which means Supabase can
see extension objects like `spatial_ref_sys` in an exposed schema. The better
cleanup is to move/reinstall PostGIS into an unexposed schema such as
`extensions` or `gis`, or use owner-level support to lock down the extension
objects.
