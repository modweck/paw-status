// Shared domain contracts will move here as the backend takes shape.
// TODO(backend): Move service ids, dog size categories, booking request payloads,
// and public error codes here before apps/api and apps/web diverge.
export const pawStatusCorePackage = '@paw-status/core';

export const GROOMER_MEMBERSHIP_STATUSES = Object.freeze(['pending', 'verified', 'rejected']);

export const GROOMER_MEMBERSHIP_REVIEW_DECISIONS = Object.freeze({
  verify: 'verified',
  reject: 'rejected',
});

export const ADMIN_GROOMER_VERIFICATION_ERROR_CODES = Object.freeze({
  notImplemented: 'ADMIN_GROOMER_VERIFICATION_NOT_IMPLEMENTED',
  notAuthenticated: 'ADMIN_NOT_AUTHENTICATED',
  notAuthorized: 'ADMIN_NOT_AUTHORIZED',
  claimNotFound: 'GROOMER_MEMBERSHIP_CLAIM_NOT_FOUND',
  invalidDecision: 'GROOMER_MEMBERSHIP_INVALID_REVIEW_DECISION',
});

export const ADMIN_ACCESS_REQUEST_STATUSES = Object.freeze(['pending', 'approved', 'denied']);

export const ADMIN_ACCESS_REVIEW_DECISIONS = Object.freeze({
  approve: 'approved',
  deny: 'denied',
});

// TODO(admin): Move all admin/groomer-verification payload schemas here before
// the web app and API implement the review queue independently.
export const ADMIN_GROOMER_VERIFICATION_TODO = Object.freeze({
  listPayload: 'pending groomer membership claims with account and public groomer profile summary',
  reviewPayload: 'membership id, verify/reject decision, reviewer note, and audit metadata',
  adminAccessPayload: 'admin access request id, requester identity, approve/deny decision, and audit metadata',
});
