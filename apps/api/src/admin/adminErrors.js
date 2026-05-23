// Maps internal admin error codes to user-safe public messages. Anything not in
// this allowlist falls back to a generic message so raw Supabase or JS exception
// strings can never leak through an API response.

const PUBLIC_ADMIN_ERROR_MESSAGES = Object.freeze({
  ADMIN_AUTH_REQUIRED: 'Sign in to continue.',
  ADMIN_AUTH_INVALID: 'Sign in to continue.',
  ADMIN_AUTH_FORBIDDEN: 'You are not authorized to use the admin area.',
  ADMIN_ALLOWLIST_EMPTY: 'Admin allowlist is not configured on the server.',
  ADMIN_SUPABASE_ENV_MISSING: 'Server is misconfigured.',
  ADMIN_GROOMER_CLAIMS_QUERY_FAILED: 'Failed to load pending groomer claims.',
  ADMIN_REVIEW_MEMBERSHIP_REQUIRED: 'Choose a groomer claim to review.',
  ADMIN_REVIEW_DECISION_INVALID: 'Choose verify or reject.',
  ADMIN_REVIEW_NOT_PENDING: 'This claim is no longer pending review.',
  ADMIN_REVIEW_QUERY_FAILED: 'Failed to update the groomer claim.',
  ADMIN_REVIEW_MEMBERSHIP_MALFORMED: 'Invalid groomer claim id in the request path.',
});

const DEFAULT_PUBLIC_MESSAGE = 'Admin verification request failed.';
const DEFAULT_ADMIN_ERROR_CODE = 'ADMIN_GROOMER_VERIFICATION_ERROR';

export function toPublicAdminErrorBody(error) {
  const code = error?.code || DEFAULT_ADMIN_ERROR_CODE;
  return {
    code,
    error: PUBLIC_ADMIN_ERROR_MESSAGES[code] || DEFAULT_PUBLIC_MESSAGE,
  };
}

export function safeDecodeMembershipId(rawSegment) {
  try {
    return decodeURIComponent(String(rawSegment || ''));
  } catch {
    const error = new Error('Invalid groomer claim id in the request path.');
    error.status = 400;
    error.code = 'ADMIN_REVIEW_MEMBERSHIP_MALFORMED';
    throw error;
  }
}
