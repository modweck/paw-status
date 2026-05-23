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

function getRequestId(event) {
  const match = String(event.path || '').match(/\/admin\/access-requests\/([^/]+)\/review$/);
  return match ? decodeURIComponent(match[1]) : '';
}

export async function handler(event) {
  // TODO(admin): Keep this as a thin Netlify adapter only until apps/api has a
  // chosen runtime. The real route must verify this bearer token server-side.
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
      {
        accessToken: getBearerToken(event),
        env: process.env,
        requestId: event.headers?.['x-nf-request-id'] || '',
      },
      {
        ...body,
        requestId: getRequestId(event),
      },
    );
    return json(200, { request });
  } catch (error) {
    return json(error.status || 500, {
      code: error.code || 'ADMIN_ACCESS_ERROR',
      error: error.message,
    });
  }
}
