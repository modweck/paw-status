import { toPublicAdminErrorBody } from '../../../api/src/admin/adminErrors.js';
import { listPendingGroomerMembershipClaims } from '../../../api/src/admin/groomerVerification.js';

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

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Method Not Allowed' });
  }

  try {
    const claims = await listPendingGroomerMembershipClaims({
      accessToken: getBearerToken(event),
      env: process.env,
    });
    return json(200, { claims });
  } catch (error) {
    return json(error.status || 500, toPublicAdminErrorBody(error));
  }
}
