import { toPublicAdminErrorBody } from '../../../api/src/admin/adminErrors.js';
import { reviewAdminAccessRequest } from '../../../api/src/admin/adminAccess.js';

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

function getRawRequestSegment(event) {
  const match = String(event.path || '').match(/\/admin\/access-requests\/([^/]+)\/review$/);
  return match ? match[1] : '';
}

export async function handler(event) {
  // TODO(admin): Implement the real admin access flow (separate from groomer
  // membership claim review). Until then this endpoint returns 501 through the
  // public error allowlist so no raw exception message leaks.
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
    const request = await reviewAdminAccessRequest(
      { accessToken: getBearerToken(event), env: process.env },
      { ...body, requestId: getRawRequestSegment(event) },
    );
    return json(200, { request });
  } catch (error) {
    return json(error.status || 500, toPublicAdminErrorBody(error));
  }
}
