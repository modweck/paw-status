// Skeleton for admin access requests. This is intentionally not wired to the
// browser yet because admin approval needs a trusted first-admin bootstrap.

export const ADMIN_ACCESS_ROUTES = Object.freeze([
  {
    method: 'GET',
    path: '/admin/access-requests',
    purpose: 'List pending requests to become PawStatus admins.',
  },
  {
    method: 'POST',
    path: '/admin/access-requests/:requestId/review',
    purpose: 'Approve or deny a pending admin access request.',
  },
]);

function notImplemented(operation) {
  const error = new Error(`${operation} is not implemented yet.`);
  error.code = 'ADMIN_ACCESS_NOT_IMPLEMENTED';
  error.status = 501;
  return error;
}

export async function listPendingAdminAccessRequests(_context = {}) {
  // TODO(admin): Choose the bootstrap model first. A signed-in user cannot
  // approve themselves into admin status without an already-trusted authority.
  // TODO(admin): Verify session server-side and require existing admin status
  // from app_metadata, a server-owned admin_users table, or the server-only
  // ADMIN_BOOTSTRAP_EMAILS env allowlist during initial setup.
  // TODO(admin): Return only pending access-request summaries.
  throw notImplemented('listPendingAdminAccessRequests');
}

export async function reviewAdminAccessRequest(_context = {}, _input = {}) {
  // TODO(admin): Validate request id, approve/deny decision, reviewer note, and
  // idempotency key.
  // TODO(admin): Re-check reviewer admin status inside this command.
  // TODO(admin): Use a transaction/RPC to update the access request, update the
  // chosen admin authority, and write an audit event.
  // TODO(admin): Notify the requesting user only after the transaction commits.
  throw notImplemented('reviewAdminAccessRequest');
}
