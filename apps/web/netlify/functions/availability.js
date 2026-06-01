import {
  handleAvailabilityRequest,
  toPublicAvailabilityError,
} from '../../server/availability.js';

function json(statusCode, body) {
  return {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    statusCode,
  };
}

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Method Not Allowed' });
  }

  const groomerId = event.queryStringParameters?.groomerId || '';
  const serviceId = event.queryStringParameters?.serviceId || '';
  const timezone = event.queryStringParameters?.timezone || '';

  if (!groomerId) {
    return json(400, { error: 'groomerId is required' });
  }

  try {
    const result = await handleAvailabilityRequest(
      { groomerId, serviceId, timezone },
      process.env,
    );
    return json(200, result);
  } catch (error) {
    const publicError = toPublicAvailabilityError(error);
    return json(publicError.statusCode, publicError.body);
  }
}
