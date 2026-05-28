import {
  autocompletePlaces,
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
    const suggestions = await autocompletePlaces({
      input: body.input,
      near: body.near,
      env: process.env,
    });
    return json(200, { suggestions });
  } catch (error) {
    const publicError = toPublicGooglePlacesError(error);
    return json(publicError.statusCode, publicError.body);
  }
}
