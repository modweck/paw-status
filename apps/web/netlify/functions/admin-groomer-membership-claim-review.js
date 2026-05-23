import { safeDecodeMembershipId, toPublicAdminErrorBody } from '../../../api/src/admin/adminErrors.js';
import { reviewGroomerMembershipClaim } from '../../../api/src/admin/groomerVerification.js';

function json(statusCode, body) {
  return {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    statusCode,
  };
}

function getBearerToken(event) {
  const authorization = event.headers?.authorization || event.headers?.Authorization || '';
  return authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : '';
}

function getRawMembershipSegment(event) {
  const match = String(event.path || '').match(/\/groomer-membership-claims\/([^/]+)\/review$/);
  return match ? match[1] : '';
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method Not Allowed' });
  }

  let body = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  try {
    const membershipId = safeDecodeMembershipId(getRawMembershipSegment(event));
    const claim = await reviewGroomerMembershipClaim(
      { accessToken: getBearerToken(event), env: process.env },
      { ...body, membershipId },
    );
    return json(200, { claim });
  } catch (error) {
    return json(error.status || 500, toPublicAdminErrorBody(error));
  }
}
