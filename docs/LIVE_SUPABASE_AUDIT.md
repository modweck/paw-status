# Live Supabase Audit

Date: 2026-05-05

Updated: 2026-05-06

This audit used the `.env` values locally and made read-only REST requests to the configured Supabase project.

## Project

```text
Project ref: faizrqajtdttcklflcbz
URL: https://faizrqajtdttcklflcbz.supabase.co
```

## Connection Result

- Authenticated REST request with `SUPABASE_SECRET_KEY`: HTTP 200.
- `groomers` count through REST headers: 349 rows.
- `appointments` count through REST headers: 5 rows.

No secret keys or raw row contents were printed.

## Exposed App Tables

The REST OpenAPI metadata exposes these app tables:

- `appointments`
- `customers`
- `dogs`
- `groomers`

It also exposes PostGIS metadata tables:

- `geography_columns`
- `geometry_columns`
- `spatial_ref_sys`

## Exposed RPC Surface

The expected app RPC is exposed:

- `nearby_groomers`

The OpenAPI metadata also exposes many PostGIS functions under `/rpc/...`. This should be reviewed during hardening. The current local Supabase config exposes `public` and `graphql_public`, with `extensions` in the extra search path, so the remote project may need function/schema exposure cleanup depending on its dashboard settings and grants.

## Current Risk Notes

- The live API is reachable with the service key.
- The prototype app uses the publishable key from browser code, which is normal only if RLS is correct.
- `db/02_relax_rls_prototype.sql` had been applied to the live project, but it was replaced by auth-gated policies on 2026-05-06.
- The current static app likely needs magic-link auth wiring before booking/customer flows work again.

## Live RLS Policy State

Checked with:

```bash
supabase link --project-ref faizrqajtdttcklflcbz
supabase db query --linked
```

RLS is enabled on all four app tables:

- `appointments`
- `customers`
- `dogs`
- `groomers`

However, the live policies currently allow public read/write on customer data tables:

| Table | Live policy | Command | Roles | Qual | With check |
| --- | --- | --- | --- | --- | --- |
| `appointments` | `prototype_appointments_all` | `ALL` | `{public}` | `true` | `true` |
| `customers` | `prototype_customers_all` | `ALL` | `{public}` | `true` | `true` |
| `dogs` | `prototype_dogs_all` | `ALL` | `{public}` | `true` | `true` |
| `groomers` | `groomers are public` | `SELECT` | `{public}` | `true` | `NULL` |

Conclusion: the live project is currently prototype-open for customers, dogs, and appointments. It should not be treated as production-safe.

## Post-Hardening RLS State

Applied migrations:

- `20260506023427_baseline_prototype_schema.sql`
- `20260506202626_restore_auth_gated_rls.sql`

Remote migration history now records both migrations.

The public prototype policies were removed:

- `prototype_appointments_all`
- `prototype_customers_all`
- `prototype_dogs_all`

Current live policies:

| Table | Live policy | Command | Purpose |
| --- | --- | --- | --- |
| `appointments` | `appointments visible to dog owner` | `SELECT` | Owner can read appointments through owned dogs |
| `appointments` | `customers create own appointments` | `INSERT` | Owner can create appointments for owned dogs |
| `appointments` | `customers update own appointments` | `UPDATE` | Interim owner reschedule/cancel support |
| `customers` | `customers insert own row` | `INSERT` | User can create own customer row |
| `customers` | `customers see own row` | `SELECT` | User can read own customer row |
| `customers` | `customers update own row` | `UPDATE` | User can update own customer row |
| `dogs` | `dogs belong to customer` | `ALL` | User can manage dogs through owned customer row |
| `groomers` | `groomers are public` | `SELECT` | Public groomer search |

Public-key verification:

- Anonymous customer read: HTTP 200 with zero visible rows.
- Anonymous groomer read: HTTP 206 with 349 visible rows.

Conclusion: customer/dog/appointment data is no longer publicly readable through the publishable key. Public groomer search still works.

## Next Checks

- [x] Inspect live RLS policies through Supabase SQL editor, CLI link, or MCP.
- [x] Confirm whether `db/02_relax_rls_prototype.sql` was applied to the live project.
- [x] Replace live prototype public policies with auth-gated policies.
- [ ] Confirm Supabase Auth providers that are enabled.
- [ ] Confirm whether PostGIS RPC functions should be exposed through the public REST API.
- [ ] Confirm whether `nearby_groomers` should return groomer phone numbers publicly.
