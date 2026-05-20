# Supabase Project Notes

This directory was initialized with Supabase CLI 2.90.0.

## Purpose

Use this directory for local Supabase configuration, migrations, and future schema tests. The old `db/` directory is still present for historical prototype SQL.

## Current Migration

- `migrations/20260506023427_baseline_prototype_schema.sql`

This migration captures the intended baseline schema from `db/schema.sql` and keeps the auth-gated policies. It does not include the prototype-open policies from `db/02_relax_rls_prototype.sql`.

## Production Warning

Do not apply `db/02_relax_rls_prototype.sql` to production. It allows public read/write on customer, dog, and appointment tables.

## Next Supabase Work

- Link the CLI to the remote project once an access token is available.
- Inspect live RLS policies.
- Confirm whether prototype-open policies are live.
- Add salon/groomer ownership tables.
- Replace localStorage-based customer identity with Supabase Auth.
- Add production-safe customer and groomer RLS policies.
- Add tests or verification SQL for ownership boundaries.
