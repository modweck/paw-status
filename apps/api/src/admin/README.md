# Admin Groomer Verification

This folder is the future backend home for reviewing `groomer_memberships`
claims.

The review path must stay server-side because it changes who can see customer
booking packets in the groomer dashboard.

## Intended Flow

1. A signed-in groomer creates a `groomer_accounts` row.
2. The groomer requests a claim on a public `groomers` profile.
3. The claim is stored as `groomer_memberships.status = 'pending'`.
4. A trusted PawStatus admin reviews the claim.
5. The backend changes the claim to `verified` or `rejected`.
6. Verified memberships unlock owned request handling through existing RLS.

## TODO

- Add backend auth middleware that verifies the Supabase session.
- Define the admin authorization source: Supabase `app_metadata`, an
  `admin_users` table, or another server-owned allowlist.
- Add `GET /admin/groomer-membership-claims` for pending claims.
- Add `POST /admin/groomer-membership-claims/:membershipId/review` for
  verify/reject decisions.
- Add `GET /admin/access-requests` and
  `POST /admin/access-requests/:requestId/review` after the first-admin
  bootstrap model exists.
- Add an audit table for membership review events.
- Add idempotency and row locking/transactional updates for concurrent reviews.
- Add notification hooks after successful review.
- Add tests for unauthenticated, non-admin, happy path, invalid decision,
  already-reviewed claim, and forbidden cross-account access.
