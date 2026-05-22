const GOOGLE_PLACES_BASE_URL = 'https://places.googleapis.com/v1';
const DEFAULT_MAX_WIDTH = 600;
const MIN_MAX_WIDTH = 80;
const MAX_MAX_WIDTH = 1600;

// TODO(backend): Move Google Places access behind apps/api with request quotas,
// caching, attribution persistence rules, and groomer/place ownership checks.
export class GooglePlacesPhotoError extends Error {
  constructor(publicMessage, statusCode = 500) {
    super(publicMessage);
    this.name = 'GooglePlacesPhotoError';
    this.publicMessage = publicMessage;
    this.statusCode = statusCode;
  }
}

export function normalizeMaxWidth(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_WIDTH;
  if (parsed < MIN_MAX_WIDTH) return MIN_MAX_WIDTH;
  if (parsed > MAX_MAX_WIDTH) return MAX_MAX_WIDTH;
  return parsed;
}

export function normalizeAttributionUrl(value) {
  if (!value || typeof value !== 'string') return '';
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('https://') || value.startsWith('http://')) return value;
  return '';
}

export function normalizeAuthorAttributions(authorAttributions = []) {
  if (!Array.isArray(authorAttributions)) return [];

  return authorAttributions
    .map((attribution) => ({
      displayName: attribution?.displayName || '',
      uri: normalizeAttributionUrl(attribution?.uri),
      photoUri: normalizeAttributionUrl(attribution?.photoUri),
    }))
    .filter((attribution) => attribution.displayName || attribution.uri || attribution.photoUri);
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function requireFetch(fetchImpl) {
  if (typeof fetchImpl === 'function') return fetchImpl;
  if (typeof fetch === 'function') return fetch;
  throw new GooglePlacesPhotoError('Server fetch is not available.', 500);
}

function requirePlaceId(placeId) {
  const normalized = String(placeId || '').trim();
  if (!normalized) {
    throw new GooglePlacesPhotoError('placeId is required.', 400);
  }
  return normalized;
}

function requireApiKey(apiKey) {
  const normalized = String(apiKey || '').trim();
  if (!normalized) {
    throw new GooglePlacesPhotoError('Google Places API key is not configured on the server.', 500);
  }
  return normalized;
}

export async function fetchGooglePlacePhoto({
  apiKey,
  fetchImpl,
  maxWidth,
  placeId,
} = {}) {
  // TODO(backend): Cache positive and negative lookups to control Google API
  // spend while still respecting Places photo freshness/attribution rules.
  const key = requireApiKey(apiKey);
  const id = requirePlaceId(placeId);
  const requestFetch = requireFetch(fetchImpl);

  const detailsResponse = await requestFetch(
    `${GOOGLE_PLACES_BASE_URL}/places/${encodeURIComponent(id)}`,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'id,photos',
      },
    },
  );

  if (!detailsResponse.ok) {
    throw new GooglePlacesPhotoError('Could not load Google Places photo metadata.', detailsResponse.status);
  }

  const details = await readJson(detailsResponse);
  const photo = Array.isArray(details.photos) ? details.photos.find((item) => item?.name) : null;

  if (!photo) {
    throw new GooglePlacesPhotoError('No Google Places photo found for this groomer.', 404);
  }

  const photoName = photo.name.endsWith('/media') ? photo.name : `${photo.name}/media`;
  const photoUrl = new URL(`${GOOGLE_PLACES_BASE_URL}/${photoName}`);
  photoUrl.searchParams.set('maxWidthPx', String(normalizeMaxWidth(maxWidth)));
  photoUrl.searchParams.set('skipHttpRedirect', 'true');
  photoUrl.searchParams.set('key', key);

  const photoResponse = await requestFetch(photoUrl.toString());
  if (!photoResponse.ok) {
    throw new GooglePlacesPhotoError('Could not load Google Places photo.', photoResponse.status);
  }

  const photoData = await readJson(photoResponse);
  if (!photoData.photoUri) {
    throw new GooglePlacesPhotoError('Google Places photo response did not include a photo URI.', 502);
  }

  return {
    photoUri: photoData.photoUri,
    authorAttributions: normalizeAuthorAttributions(photo.authorAttributions),
    source: 'google_maps',
  };
}

export function toPublicPhotoError(error) {
  if (error instanceof GooglePlacesPhotoError) {
    return {
      statusCode: error.statusCode,
      body: {
        error: error.publicMessage,
      },
    };
  }

  return {
    statusCode: 500,
    body: {
      error: 'Could not load groomer photo.',
    },
  };
}
