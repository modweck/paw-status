// Server-side proxy for Google Places API (Autocomplete + Details).
// The API key stays in env (GOOGLE_PLACES_API_KEY) and is never exposed
// to the browser — same pattern as googlePlacesPhoto.js.
//
// Two operations:
//   - autocompletePlaces({ input, near }): suggestions as the user types
//   - placeDetails({ placeId }): resolves a chosen suggestion to lat/lng
//
// Result shapes are normalised so the frontend doesn't have to know
// anything about Google's response format.

const GOOGLE_PLACES_BASE_URL = 'https://places.googleapis.com/v1';

// Bias autocomplete results inside this radius of the supplied center.
// Google's locationBias is a soft preference, not a filter.
const AUTOCOMPLETE_RADIUS_METERS = 50_000;
const MIN_INPUT_LENGTH = 3;
const DEFAULT_NEAR = Object.freeze({ lat: 40.768, lng: -73.958 });

export class GooglePlacesError extends Error {
  constructor(publicMessage, statusCode = 500, code = 'GOOGLE_PLACES_ERROR') {
    super(publicMessage);
    this.name = 'GooglePlacesError';
    this.publicMessage = publicMessage;
    this.statusCode = statusCode;
    this.code = code;
  }
}

function resolveApiKey(env) {
  const key = env?.GOOGLE_PLACES_API_KEY;
  if (!key) {
    throw new GooglePlacesError(
      'Server is not configured for address search.',
      500,
      'GOOGLE_PLACES_CONFIG_MISSING',
    );
  }
  return key;
}

function normalizeNear(near) {
  const lat = Number(near?.lat);
  const lng = Number(near?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  return DEFAULT_NEAR;
}

function shapeSuggestion(prediction) {
  if (!prediction) return null;
  const placeId = prediction.placeId || '';
  if (!placeId) return null;
  const main = prediction.structuredFormat?.mainText?.text || '';
  const secondary = prediction.structuredFormat?.secondaryText?.text || '';
  const fullText = prediction.text?.text || [main, secondary].filter(Boolean).join(', ');
  return {
    placeId,
    displayName: fullText,
    mainText: main,
    secondaryText: secondary,
  };
}

export async function autocompletePlaces({
  input,
  near,
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const cleaned = String(input || '').trim();
  if (cleaned.length < MIN_INPUT_LENGTH) {
    return [];
  }

  const apiKey = resolveApiKey(env);
  const center = normalizeNear(near);

  const body = {
    input: cleaned,
    includedRegionCodes: ['us'],
    locationBias: {
      circle: {
        center: { latitude: center.lat, longitude: center.lng },
        radius: AUTOCOMPLETE_RADIUS_METERS,
      },
    },
  };

  let response;
  try {
    response = await fetchImpl(`${GOOGLE_PLACES_BASE_URL}/places:autocomplete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'suggestions.placePrediction.placeId,' +
          'suggestions.placePrediction.text,' +
          'suggestions.placePrediction.structuredFormat',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new GooglePlacesError(
      'Address search is temporarily unavailable.',
      502,
      'GOOGLE_PLACES_NETWORK_ERROR',
    );
  }

  if (!response.ok) {
    // Log the upstream status so on-call can tell quota/auth/billing from a
    // transient network blip. Public message stays generic.
    // eslint-disable-next-line no-console
    console.warn('[google-places] autocomplete upstream non-2xx', {
      status: response.status,
    });
    throw new GooglePlacesError(
      'Address search is temporarily unavailable.',
      502,
      'GOOGLE_PLACES_UPSTREAM_ERROR',
    );
  }

  const payload = await response.json().catch(() => ({}));
  const suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
  return suggestions
    .map((entry) => shapeSuggestion(entry?.placePrediction))
    .filter(Boolean);
}

const BUSINESS_SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.rating',
  'places.userRatingCount',
].join(',');

function shapeBusiness(place) {
  if (!place) return null;
  const placeId = place.id || '';
  if (!placeId) return null;
  return {
    placeId,
    name: place.displayName?.text || '',
    address: place.formattedAddress || '',
    rating: typeof place.rating === 'number' ? place.rating : null,
    reviewCount: typeof place.userRatingCount === 'number' ? place.userRatingCount : null,
  };
}

// Find businesses by name/text (Places Text Search), used by groomers to locate
// their own salon when adding it. Returns lightweight candidates; the full
// detail (coords, phone, website) is fetched via placeDetails at link time.
export async function searchBusinesses({ query, near, env = process.env, fetchImpl = fetch } = {}) {
  const cleaned = String(query || '').trim();
  if (cleaned.length < MIN_INPUT_LENGTH) {
    return [];
  }

  const apiKey = resolveApiKey(env);
  const body = { textQuery: cleaned, maxResultCount: 10 };
  if (near) {
    const center = normalizeNear(near);
    body.locationBias = {
      circle: {
        center: { latitude: center.lat, longitude: center.lng },
        radius: AUTOCOMPLETE_RADIUS_METERS,
      },
    };
  }

  let response;
  try {
    response = await fetchImpl(`${GOOGLE_PLACES_BASE_URL}/places:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': BUSINESS_SEARCH_FIELD_MASK,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new GooglePlacesError(
      'Business search is temporarily unavailable.',
      502,
      'GOOGLE_PLACES_NETWORK_ERROR',
    );
  }

  if (!response.ok) {
    // eslint-disable-next-line no-console
    console.warn('[google-places] searchText upstream non-2xx', { status: response.status });
    throw new GooglePlacesError(
      'Business search is temporarily unavailable.',
      502,
      'GOOGLE_PLACES_UPSTREAM_ERROR',
    );
  }

  const payload = await response.json().catch(() => ({}));
  const places = Array.isArray(payload?.places) ? payload.places : [];
  return places.map(shapeBusiness).filter(Boolean);
}

function shapeDetails(place) {
  if (!place) return null;
  const lat = Number(place.location?.latitude);
  const lng = Number(place.location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    displayName: place.formattedAddress || place.shortFormattedAddress || '',
  };
}

export async function placeDetails({
  placeId,
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const cleaned = String(placeId || '').trim();
  if (!cleaned) {
    throw new GooglePlacesError(
      'Choose an address from the suggestions.',
      400,
      'GOOGLE_PLACES_PLACE_ID_REQUIRED',
    );
  }

  const apiKey = resolveApiKey(env);

  let response;
  try {
    response = await fetchImpl(
      `${GOOGLE_PLACES_BASE_URL}/places/${encodeURIComponent(cleaned)}`,
      {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'location,formattedAddress,shortFormattedAddress',
        },
      },
    );
  } catch {
    throw new GooglePlacesError(
      'Address details are temporarily unavailable.',
      502,
      'GOOGLE_PLACES_NETWORK_ERROR',
    );
  }

  if (response.status === 404) {
    throw new GooglePlacesError(
      'That address could not be found.',
      404,
      'GOOGLE_PLACES_NOT_FOUND',
    );
  }

  if (!response.ok) {
    // eslint-disable-next-line no-console
    console.warn('[google-places] details upstream non-2xx', {
      status: response.status,
    });
    throw new GooglePlacesError(
      'Address details are temporarily unavailable.',
      502,
      'GOOGLE_PLACES_UPSTREAM_ERROR',
    );
  }

  const payload = await response.json().catch(() => ({}));
  const shaped = shapeDetails(payload);
  if (!shaped) {
    throw new GooglePlacesError(
      'That address could not be located.',
      404,
      'GOOGLE_PLACES_LOCATION_MISSING',
    );
  }
  return shaped;
}

const BUSINESS_DETAILS_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'rating',
  'userRatingCount',
].join(',');

// Full business detail for linking a groomer profile from a chosen place.
export async function placeBusinessDetails({ placeId, env = process.env, fetchImpl = fetch } = {}) {
  const cleaned = String(placeId || '').trim();
  if (!cleaned) {
    throw new GooglePlacesError(
      'Choose a business from the results.',
      400,
      'GOOGLE_PLACES_PLACE_ID_REQUIRED',
    );
  }

  const apiKey = resolveApiKey(env);

  let response;
  try {
    response = await fetchImpl(`${GOOGLE_PLACES_BASE_URL}/places/${encodeURIComponent(cleaned)}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': BUSINESS_DETAILS_FIELD_MASK,
      },
    });
  } catch {
    throw new GooglePlacesError(
      'Business details are temporarily unavailable.',
      502,
      'GOOGLE_PLACES_NETWORK_ERROR',
    );
  }

  if (response.status === 404) {
    throw new GooglePlacesError('That business could not be found.', 404, 'GOOGLE_PLACES_NOT_FOUND');
  }
  if (!response.ok) {
    // eslint-disable-next-line no-console
    console.warn('[google-places] business details upstream non-2xx', { status: response.status });
    throw new GooglePlacesError(
      'Business details are temporarily unavailable.',
      502,
      'GOOGLE_PLACES_UPSTREAM_ERROR',
    );
  }

  const payload = await response.json().catch(() => ({}));
  const lat = Number(payload.location?.latitude);
  const lng = Number(payload.location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new GooglePlacesError(
      'That business is missing a location.',
      404,
      'GOOGLE_PLACES_LOCATION_MISSING',
    );
  }

  return {
    placeId: payload.id || cleaned,
    name: payload.displayName?.text || '',
    address: payload.formattedAddress || '',
    lat,
    lng,
    phone: payload.nationalPhoneNumber || payload.internationalPhoneNumber || null,
    website: payload.websiteUri || null,
    rating: typeof payload.rating === 'number' ? payload.rating : null,
    reviewCount: typeof payload.userRatingCount === 'number' ? payload.userRatingCount : null,
  };
}

export function toPublicGooglePlacesError(error) {
  if (error instanceof GooglePlacesError) {
    return {
      statusCode: error.statusCode,
      body: { code: error.code, error: error.publicMessage },
    };
  }
  return {
    statusCode: 500,
    body: { code: 'GOOGLE_PLACES_ERROR', error: 'Address search failed.' },
  };
}
