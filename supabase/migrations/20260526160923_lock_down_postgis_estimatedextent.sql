-- Lock down the three public.st_estimatedextent overloads so anon and
-- authenticated cannot call them via /rest/v1/rpc/st_estimatedextent.
--
-- These are PostGIS helpers installed as SECURITY DEFINER in the public
-- schema. Postgres grants EXECUTE to the PUBLIC role by default at
-- function creation time, and Supabase's anon + authenticated roles
-- inherit from PUBLIC, which is why the advisor flags them. Revoking
-- from anon/authenticated directly would silently no-op because the
-- grant lives on PUBLIC, so we REVOKE from PUBLIC instead — that
-- removes the inherited permission for both roles in one statement
-- and actually closes six advisor findings:
--   anon_security_definer_function_executable × 3
--   authenticated_security_definer_function_executable × 3
--
-- Nothing in the application surface calls these helpers. nearby_groomers
-- uses st_distance, st_makepoint, and st_dwithin — none of which are
-- touched here. The PostGIS extension itself does not rely on the PUBLIC
-- grant either; these are user-facing query helpers.
--
-- The two remaining PostGIS advisor findings cannot be closed inside a
-- normal migration owned by the project role:
--   extension_in_public (postgis) — needs the Supabase-documented PostGIS
--     relocation procedure; the extension currently owns the
--     `geography(Point, 4326)` column on `groomers.location` and the
--     `nearby_groomers` function, so moving it is a multi-step surgery
--     that should be scheduled separately.
--   rls_disabled_in_public (spatial_ref_sys) — table is owned by
--     `supabase_admin`; `alter table … enable row level security` fails
--     with "must be owner of table spatial_ref_sys". Relocating PostGIS
--     also moves this table and closes the finding implicitly.

begin;

revoke execute on function public.st_estimatedextent(text, text) from public;
revoke execute on function public.st_estimatedextent(text, text, text) from public;
revoke execute on function public.st_estimatedextent(text, text, text, boolean) from public;

commit;
