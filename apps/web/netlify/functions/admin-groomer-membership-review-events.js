import { toPublicAdminErrorBody } from '../../../api/src/admin/adminErrors.js';
import { getGroomerVerificationAuditTrail } from '../../../api/src/admin/groomerVerification.js';

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

function getQuery(event) {
  const queryParams = event.queryStringParameters || {};
  return {
    membershipId: queryParams.membershipId || '',
    limit: queryParams.limit || '',
  };
}

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Method Not Allowed' });
  }

  try {
    const events = await getGroomerVerificationAuditTrail(
      { accessToken: getBearerToken(event), env: process.env },
      getQuery(event),
    );
    return json(200, { events });
  } catch (error) {
    return json(error.status || 500, toPublicAdminErrorBody(error));
  }
}
