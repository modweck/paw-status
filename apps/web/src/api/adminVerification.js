export const ADMIN_GROOMER_VERIFICATION_ENDPOINTS = Object.freeze({
  listClaims: '/api/admin/groomer-membership-claims',
  reviewClaim: (membershipId) =>
    `/api/admin/groomer-membership-claims/${encodeURIComponent(membershipId)}/review`,
  listAdminAccessRequests: '/api/admin/access-requests',
  reviewAdminAccessRequest: (requestId) =>
    `/api/admin/access-requests/${encodeURIComponent(requestId)}/review`,
});

function requireMembershipId(membershipId) {
  const cleaned = String(membershipId || '').trim();
  if (!cleaned) {
    throw new Error('Choose a groomer claim to review.');
  }

  return cleaned;
}

function normalizeDecision(decision) {
  const cleaned = String(decision || '').trim();
  if (!['verify', 'reject'].includes(cleaned)) {
    throw new Error('Choose verify or reject.');
  }

  return cleaned;
}

function normalizeAdminAccessDecision(decision) {
  const cleaned = String(decision || '').trim();
  if (!['approve', 'deny'].includes(cleaned)) {
    throw new Error('Choose approve or deny.');
  }

  return cleaned;
}

function buildHeaders(accessToken = '', extraHeaders = {}) {
  const headers = {
    Accept: 'application/json',
    ...extraHeaders,
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || payload.message || 'Admin verification request failed.');
  }

  return payload;
}

export async function loadPendingGroomerMembershipClaims({
  accessToken = '',
  fetcher = fetch,
} = {}) {
  // TODO(admin): Wire this to the real apps/api or Netlify route after backend
  // admin auth exists. The route must verify the session server-side and must
  // not expose claim review data to normal groomer/customer users.
  // TODO(admin): Keep using bearer-token auth unless the app moves to a
  // server-managed Supabase cookie session; do not rely on browser-only gating.
  const response = await fetcher(ADMIN_GROOMER_VERIFICATION_ENDPOINTS.listClaims, {
    credentials: 'include',
    headers: buildHeaders(accessToken),
  });

  return parseResponse(response);
}

export async function loadPendingAdminAccessRequests({
  accessToken = '',
  fetcher = fetch,
} = {}) {
  // TODO(admin): Wire this to a server-owned admin access request table after
  // the first admin bootstrap source is chosen. Admin approval is recursive, so
  // the first trusted admin must come from app_metadata, an env allowlist, or a
  // manually inserted server-owned row.
  const response = await fetcher(ADMIN_GROOMER_VERIFICATION_ENDPOINTS.listAdminAccessRequests, {
    credentials: 'include',
    headers: buildHeaders(accessToken),
  });

  return parseResponse(response);
}

export async function reviewGroomerMembershipClaim(
  membershipId,
  decision,
  { accessToken = '', fetcher = fetch, reviewerNote = '' } = {},
) {
  // TODO(admin): Include an idempotency key once the backend route exists so a
  // retry cannot double-write audit events or duplicate notifications.
  const response = await fetcher(
    ADMIN_GROOMER_VERIFICATION_ENDPOINTS.reviewClaim(requireMembershipId(membershipId)),
    {
      body: JSON.stringify({
        decision: normalizeDecision(decision),
        reviewerNote: String(reviewerNote || '').trim(),
      }),
      credentials: 'include',
      headers: buildHeaders(accessToken, {
        'Content-Type': 'application/json',
      }),
      method: 'POST',
    },
  );

  return parseResponse(response);
}

export async function reviewAdminAccessRequest(
  requestId,
  decision,
  { accessToken = '', fetcher = fetch, reviewerNote = '' } = {},
) {
  // TODO(admin): This must be server-side and audited. Never let normal users
  // grant themselves admin status through a browser-readable table or claim.
  const response = await fetcher(
    ADMIN_GROOMER_VERIFICATION_ENDPOINTS.reviewAdminAccessRequest(requireMembershipId(requestId)),
    {
      body: JSON.stringify({
        decision: normalizeAdminAccessDecision(decision),
        reviewerNote: String(reviewerNote || '').trim(),
      }),
      credentials: 'include',
      headers: buildHeaders(accessToken, {
        'Content-Type': 'application/json',
      }),
      method: 'POST',
    },
  );

  return parseResponse(response);
}
