# PawStatus Production Completion Checklist

This is the canonical checklist for bringing the current repo to production
completion. Older roadmap docs are useful background, but this file is the
current source of truth.

## 1. Admin API Wiring

- [x] Add `/admin` frontend shell.
- [x] Add Netlify redirects for `/api/admin/...` route stubs.
- [x] Add Netlify function stubs for groomer-claim and admin-access review.
- [ ] Replace the stubs with real backend route handlers.
- [ ] Add route tests for method handling, invalid JSON, missing auth, non-admin
  auth, and happy paths.

## 2. Admin Auth Transport

- [x] Shape frontend admin API calls around bearer-token auth.
- [ ] Verify Supabase access tokens server-side on every admin route.
- [ ] Decide whether the long-term auth transport stays bearer-token based or
  moves to server-managed Supabase cookies.
- [ ] Reject browser-only gating as an authorization mechanism.

## 3. First-Admin Bootstrap

- [x] Add server-only `ADMIN_BOOTSTRAP_EMAILS` env placeholder.
- [ ] Choose the real first-admin authority: env allowlist, Supabase
  `app_metadata`, or server-owned `admin_users`.
- [ ] Document the manual bootstrap runbook.
- [ ] Ensure ordinary users cannot approve themselves into admin status.

## 4. Admin Schema

- [x] Add `supabase/admin_review_schema.todo.sql` as the schema sketch.
- [ ] Convert the sketch into real Supabase migrations.
- [ ] Add admin access request storage.
- [ ] Add admin audit event storage.
- [ ] Add groomer membership review event storage.
- [ ] Add RLS/grants so review writes only happen through trusted server code.

## 5. Backend Runtime

- [x] Add `apps/api/src/runtime.js` to track the runtime decision.
- [ ] Choose Netlify Functions, a dedicated Node API, or Supabase Edge
  Functions as the production route host.
- [ ] Add a local backend dev command and health endpoint.
- [ ] Add request ids, structured logs, normalized errors, and rate limiting.
- [ ] Move privileged server logic out of `apps/web/server` once runtime exists.

## 6. Real Booking

- [x] Mark current signed-in booking as `appointment_requests` only.
- [ ] Add database-backed services, prices, duration, size modifiers, and breed
  modifiers.
- [ ] Add salon/groomer hours, buffers, blocked time, and service-area rules.
- [ ] Compute available slots server-side.
- [ ] Prevent double booking with transactions, locks, constraints, or RPCs.
- [ ] Create confirmed `appointments` only after trusted confirmation.
- [ ] Add cancellation and reschedule rules.

## 7. Provider Confirmation

- [x] Add provider-confirmation skeleton under `apps/api/src/integrations/`.
- [ ] Implement Square confirmation flow if Square is the first provider.
- [ ] Add Calendly/Acuity webhook handling if those providers are kept.
- [ ] Add Google Calendar freebusy/hold/sync only where it is actually useful.
- [ ] Store external provider references and idempotency keys.
- [ ] Reconcile provider state back into PawStatus.

## 8. Notifications

- [x] Add notification command skeleton under `apps/api/src/notifications/`.
- [ ] Decide whether first production release is SMS-only or keeps OneSignal.
- [ ] Load notification context server-side from appointment/request ids.
- [ ] Check customer preferences and valid contact data before sending.
- [ ] Send only after the related database transition succeeds.
- [ ] Persist delivery attempts, provider ids, retry state, and support-visible
  errors.

## 9. Supabase Hardening Automation

- [x] Add `scripts/supabase-hardening-checks.js` placeholder.
- [ ] Turn the placeholder into executable REST/RPC probes.
- [ ] Verify anonymous users cannot read private customer/dog/appointment data.
- [ ] Verify customers can read only their own rows.
- [ ] Verify groomers can read only verified-membership request packets.
- [ ] Verify non-admins cannot list or review admin/groomer claims.
- [ ] Re-run Supabase advisors and document accepted PostGIS warnings.

## 10. TODO Cleanup

- [x] Add this canonical production checklist.
- [ ] Update older docs to point here instead of duplicating active priorities.
- [ ] Remove stale prototype-only checklist items that no longer apply to the
  shipped React path.
- [ ] Keep code-level TODOs for implementation boundaries and this doc for
  product-level completion tracking.
