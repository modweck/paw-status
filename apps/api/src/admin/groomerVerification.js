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
  {
    method: 'GET',
    path: '/admin/groomer-membership-claims/audit-events',
    purpose: 'List groomer_membership_review_events for the admin audit trail.',
  },
]);

const DECISION_TO_STATUS = Object.freeze({
  verify: 'verified',
  reject: 'rejected',
});

const AUDIT_TRAIL_DEFAULT_LIMIT = 50;
const AUDIT_TRAIL_MAX_LIMIT = 200;

// RFC 4122 / RFC 9562 (UUID v1-v8) format check. Stops malformed ids from
// reaching Postgres, where they would surface as a 500 with a generic message.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// recipient shape: { email, name, groomerName, groomerSalon }
function logReviewNotifyNeeded({
  membershipId,
  decision,
  nextStatus,
  recipient,
}) {
  // Real email delivery (Resend) is a follow-up slice. Until then we emit a
  // structured warn so an operator can grep `notifyNeeded:true` to find
  // claims that need manual outreach. The audit table also retains the
  // membership_id for backfilling later.
  //
  // PII note: recipientEmail is logged. On Netlify, function logs (and any
  // configured log drain such as Datadog/Papertrail) will capture it. That
  // is acceptable for an admin tool with low volume. When Resend lands this
  // log line should be REPLACED with the real send call rather than kept
  // alongside it, so the email is not duplicated into the log stream.
  // eslint-disable-next-line no-console
  console.warn('[admin][notify-needed] groomer claim reviewed', {
    notifyNeeded: true,
    membershipId,
    decision,
    nextStatus,
    reviewedAt: new Date().toISOString(),
    recipientEmail: recipient?.email || null,
    recipientName: recipient?.name || null,
    groomerName: recipient?.groomerName || null,
    groomerSalon: recipient?.groomerSalon || null,
  });
}

async function recordReviewEvent(
  client,
  { membershipId, decision, previousStatus, nextStatus, reviewer, reviewerNote },
) {
  const cleanedNote = String(reviewerNote || '').trim() || null;
  const reviewerEmail = String(reviewer?.email || '').trim().toLowerCase();

  const { error } = await client.from('groomer_membership_review_events').insert({
    membership_id: membershipId,
    reviewer_auth_user_id: reviewer.id,
    reviewer_email: reviewerEmail,
    decision,
    previous_status: previousStatus,
    next_status: nextStatus,
    reviewer_note: cleanedNote,
  });

  if (error) {
    // Fail open. The row update already succeeded; the user's intent is on
    // groomer_memberships. Audit rows are observability, not user state, so
    // they must not block the action. Atomicity gap is intentional: a crash
    // between the update and this insert leaves a status change with no audit
    // row, which is backfillable from groomer_memberships.updated_at if it
    // ever matters. Structured field below lets log aggregators alert on
    // sustained audit-write failures.
    // eslint-disable-next-line no-console
    console.error('[admin] groomer audit insert failed', {
      auditInsertFailed: true,
      membershipId,
      decision,
      previousStatus,
      nextStatus,
      code: error.code,
      message: error.message,
    });
  }
}

function shapeAuditEvent(row) {
  return {
    id: row.id,
    membershipId: row.membership_id,
    reviewerAuthUserId: row.reviewer_auth_user_id,
    reviewerEmail: row.reviewer_email,
    decision: row.decision,
    previousStatus: row.previous_status,
    nextStatus: row.next_status,
    reviewerNote: row.reviewer_note,
    createdAt: row.created_at,
  };
}

export async function reviewGroomerMembershipClaim(
  { accessToken = '', env = process.env, supabase } = {},
  { membershipId = '', decision = '', reviewerNote = '' } = {},
) {
  const cleanedId = String(membershipId || '').trim();
  if (!cleanedId) {
    throw reviewError(
      400,
      'ADMIN_REVIEW_MEMBERSHIP_REQUIRED',
      'Choose a groomer claim to review.',
    );
  }
  if (!UUID_PATTERN.test(cleanedId)) {
    throw reviewError(
      400,
      'ADMIN_REVIEW_MEMBERSHIP_MALFORMED',
      'Invalid groomer claim id in the request path.',
    );
  }

  const cleanedDecision = String(decision || '').trim().toLowerCase();
  const nextStatus = DECISION_TO_STATUS[cleanedDecision];
  if (!nextStatus) {
    throw reviewError(400, 'ADMIN_REVIEW_DECISION_INVALID', 'Choose verify or reject.');
  }

  const { supabase: client, user } = await requireAdminContext({
    accessToken,
    env,
    supabase,
  });

  const { data, error } = await client
    .from('groomer_memberships')
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq('id', cleanedId)
    .eq('status', 'pending')
    .select(
      `id, role, status, updated_at,
       groomer:groomers ( name, salon ),
       groomer_account:groomer_accounts ( name, email )`,
    )
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

  await recordReviewEvent(client, {
    membershipId: cleanedId,
    decision: cleanedDecision,
    previousStatus: 'pending',
    nextStatus,
    reviewer: user,
    reviewerNote,
  });

  logReviewNotifyNeeded({
    membershipId: cleanedId,
    decision: cleanedDecision,
    nextStatus,
    recipient: {
      email: data.groomer_account?.email || null,
      name: data.groomer_account?.name || null,
      groomerName: data.groomer?.name || null,
      groomerSalon: data.groomer?.salon || null,
    },
  });

  return {
    id: data.id,
    role: data.role,
    status: data.status,
    updatedAt: data.updated_at,
  };
}

export async function getGroomerVerificationAuditTrail(
  { accessToken = '', env = process.env, supabase } = {},
  { membershipId = '', limit = AUDIT_TRAIL_DEFAULT_LIMIT } = {},
) {
  const { supabase: client } = await requireAdminContext({ accessToken, env, supabase });

  const parsedLimit = Number(limit);
  const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
    ? Math.min(Math.floor(parsedLimit), AUDIT_TRAIL_MAX_LIMIT)
    : AUDIT_TRAIL_DEFAULT_LIMIT;

  let query = client
    .from('groomer_membership_review_events')
    .select(
      'id, membership_id, reviewer_auth_user_id, reviewer_email, decision, previous_status, next_status, reviewer_note, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  const cleanedMembershipId = String(membershipId || '').trim();
  if (cleanedMembershipId) {
    if (!UUID_PATTERN.test(cleanedMembershipId)) {
      throw reviewError(
        400,
        'ADMIN_REVIEW_MEMBERSHIP_MALFORMED',
        'Invalid groomer claim id in the request path.',
      );
    }
    query = query.eq('membership_id', cleanedMembershipId);
  }

  const { data, error } = await query;

  if (error) {
    const wrapped = new Error('Failed to load review audit trail.');
    wrapped.status = 500;
    wrapped.code = 'ADMIN_REVIEW_AUDIT_QUERY_FAILED';
    wrapped.cause = error;
    throw wrapped;
  }

  return (data || []).map(shapeAuditEvent);
}
