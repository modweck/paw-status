import {
  placeDetails,
  toPublicGooglePlacesError,
} from '../../server/googlePlaces.js';

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

  const placeId = event.queryStringParameters?.placeId || '';

  try {
    const details = await placeDetails({ placeId, env: process.env });
    return json(200, { place: details });
  } catch (error) {
    const publicError = toPublicGooglePlacesError(error);
    return json(publicError.statusCode, publicError.body);
  }
}
