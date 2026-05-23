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

const DECISION_TO_STATUS = Object.freeze({
  verify: 'verified',
  reject: 'rejected',
});

function notImplemented(operation) {
  const error = new Error(`${operation} is not implemented yet.`);
  error.code = 'ADMIN_GROOMER_VERIFICATION_NOT_IMPLEMENTED';
  error.status = 501;
  return error;
}

function reviewError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
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

export async function reviewGroomerMembershipClaim(
  { accessToken = '', env = process.env, supabase } = {},
  { membershipId = '', decision = '', reviewerNote = '' } = {},
) {
  // TODO(admin): Persist reviewerNote and the reviewer auth user id in a
  // dedicated audit table. The audit path is part of the next admin slice.
  // TODO(admin): Notify the groomer once an audit log exists so notification
  // events have a stable correlation id.
  if (String(reviewerNote || '').trim()) {
    // eslint-disable-next-line no-console
    console.warn(
      '[admin] reviewerNote received but audit log is not yet implemented; note discarded',
    );
  }

  const cleanedId = String(membershipId || '').trim();
  if (!cleanedId) {
    throw reviewError(
      400,
      'ADMIN_REVIEW_MEMBERSHIP_REQUIRED',
      'Choose a groomer claim to review.',
    );
  }

  const cleanedDecision = String(decision || '').trim().toLowerCase();
  const nextStatus = DECISION_TO_STATUS[cleanedDecision];
  if (!nextStatus) {
    throw reviewError(400, 'ADMIN_REVIEW_DECISION_INVALID', 'Choose verify or reject.');
  }

  const { supabase: client } = await requireAdminContext({ accessToken, env, supabase });

  const { data, error } = await client
    .from('groomer_memberships')
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq('id', cleanedId)
    .eq('status', 'pending')
    .select('id, role, status, updated_at')
    .maybeSingle();

  if (error) {
    const wrapped = new Error('Failed to update the groomer claim.');
    wrapped.status = 500;
    wrapped.code = 'ADMIN_REVIEW_QUERY_FAILED';
    wrapped.cause = error;
    throw wrapped;
  }

  if (!data) {
    throw reviewError(
      409,
      'ADMIN_REVIEW_NOT_PENDING',
      'This claim is no longer pending review.',
    );
  }

  return {
    id: data.id,
    role: data.role,
    status: data.status,
    updatedAt: data.updated_at,
  };
}

export async function getGroomerVerificationAuditTrail(_context = {}, _membershipId = '') {
  // TODO(admin): Add a dedicated audit table before exposing history. This
  // should not be inferred only from updated_at/status fields.
  throw notImplemented('getGroomerVerificationAuditTrail');
}
