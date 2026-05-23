// Admin-only groomer verification backend. Wired to the Netlify functions under
// apps/web/netlify/functions/admin-groomer-*.js.

import { requireAdminContext } from './adminAuthorization.js';

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

function shapeClaim(row) {
  const account = row.groomer_account || {};
  const groomer = row.groomer || {};

  return {
    id: row.id,
    role: row.role,
    createdAt: row.created_at,
    account: {
      id: account.id || null,
      name: account.name || null,
      email: account.email || null,
      phone: account.phone || null,
    },
    groomer: {
      id: groomer.id || null,
      name: groomer.name || null,
      salon: groomer.salon || null,
      address: groomer.address || null,
      phone: groomer.phone || null,
      website: groomer.website || null,
    },
  };
}

export async function listPendingGroomerMembershipClaims({
  accessToken = '',
  env = process.env,
  supabase,
} = {}) {
  const { supabase: client } = await requireAdminContext({ accessToken, env, supabase });

  const { data, error } = await client
    .from('groomer_memberships')
    .select(
      `id, role, created_at,
       groomer_account:groomer_accounts ( id, name, email, phone ),
       groomer:groomers ( id, name, salon, address, phone, website )`,
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    const wrapped = new Error('Failed to load pending groomer claims.');
    wrapped.status = 500;
    wrapped.code = 'ADMIN_GROOMER_CLAIMS_QUERY_FAILED';
    wrapped.cause = error;
    throw wrapped;
  }

  return (data || []).map(shapeClaim);
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
