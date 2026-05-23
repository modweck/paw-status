// Skeleton for the future admin-only groomer verification backend.
// Current Netlify deploy does not execute this package yet.

export const GROOMER_VERIFICATION_ROUTES = Object.freeze([
  {
    method: 'GET',
    path: '/admin/groomer-membership-claims',
    purpose: 'List pending groomer_memberships claims for admin review.',
  },
  {
    method: 'POST',
    path: '/admin/groomer-membership-claims/:membershipId/review',
    purpose: 'Verify or reject one pending groomer_memberships claim.',
  },
]);

function notImplemented(operation) {
  const error = new Error(`${operation} is not implemented yet.`);
  error.code = 'ADMIN_GROOMER_VERIFICATION_NOT_IMPLEMENTED';
  error.status = 501;
  return error;
}

export async function listPendingGroomerMembershipClaims(_context = {}) {
  // TODO(admin): Verify the Supabase access token server-side with
  // supabase.auth.getUser() or equivalent backend auth middleware.
  // TODO(admin): Authorize only trusted PawStatus admins. Do not rely on
  // user-editable metadata; use app_metadata or an admin table.
  // TODO(admin): Query pending groomer_memberships with joined groomer_accounts
  // and public groomers fields needed for review.
  // TODO(admin): Return only safe review data: account email/name/phone, groomer
  // profile name/address/website, created_at, and prior review metadata.
  throw notImplemented('listPendingGroomerMembershipClaims');
}

export async function reviewGroomerMembershipClaim(_context = {}, _input = {}) {
  // TODO(admin): Validate membershipId, decision, reviewer note, and idempotency
  // key before touching the database.
  // TODO(admin): Re-check admin authorization inside this command; never trust a
  // client-provided role or route-level check alone.
  // TODO(admin): Update only pending groomer_memberships to verified/rejected in
  // a transaction or RPC so concurrent reviewers cannot double-approve.
  // TODO(admin): Write an audit event with reviewer auth user id, previous
  // status, next status, reason/note, request id, and timestamp.
  // TODO(admin): Notify the groomer after the database update succeeds.
  throw notImplemented('reviewGroomerMembershipClaim');
}

export async function getGroomerVerificationAuditTrail(_context = {}, _membershipId = '') {
  // TODO(admin): Add a dedicated audit table before exposing history. This
  // should not be inferred only from updated_at/status fields.
  throw notImplemented('getGroomerVerificationAuditTrail');
}
