import { fetchGooglePlacePhoto, toPublicPhotoError } from '../../server/googlePlacesPhoto.js';

const jsonHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const result = await fetchGooglePlacePhoto({
      apiKey: process.env.GOOGLE_PLACES_API_KEY,
      maxWidth: event.queryStringParameters?.maxWidth,
      placeId: event.queryStringParameters?.placeId,
    });

    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify(result),
    };
  } catch (error) {
    const publicError = toPublicPhotoError(error);
    return {
      statusCode: publicError.statusCode,
      headers: jsonHeaders,
      body: JSON.stringify(publicError.body),
    };
  }
}
