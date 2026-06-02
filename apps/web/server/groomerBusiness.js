// Server-side logic for a groomer adding their business from Google Places.
// Searching hits Google; linking fetches the place's full details and upserts
// a groomers row using the service-role key (groomers has no client INSERT, and
// place_id / coords are intentionally not groomer-writable). Both require a
// valid Supabase session so the Google key and row creation aren't public.
import { createClient } from '@supabase/supabase-js';

import {
  GooglePlacesError,
  placeBusinessDetails,
  searchBusinesses,
  toPublicGooglePlacesError,
} from './googlePlaces.js';

export class GroomerBusinessError extends Error {
  constructor(publicMessage, statusCode = 500, code = 'GROOMER_BUSINESS_ERROR') {
    super(publicMessage);
    this.name = 'GroomerBusinessError';
    this.publicMessage = publicMessage;
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function createServiceClient(env = process.env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new GroomerBusinessError(
      'Server Supabase environment is missing.',
      500,
      'GROOMER_BUSINESS_ENV_MISSING',
    );
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function requireGroomerSession({ accessToken, env, supabase }) {
  const token = String(accessToken || '').trim();
  if (!token) {
    throw new GroomerBusinessError('Sign in to continue.', 401, 'GROOMER_BUSINESS_AUTH_REQUIRED');
  }
  const client = supabase || createServiceClient(env);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) {
    throw new GroomerBusinessError(
      'Your session is invalid. Sign in again.',
      401,
      'GROOMER_BUSINESS_AUTH_INVALID',
    );
  }
  return { user: data.user, supabase: client };
}

export async function searchGroomerBusinesses({
  accessToken,
  query,
  near,
  env = process.env,
  fetchImpl = fetch,
  supabase,
} = {}) {
  await requireGroomerSession({ accessToken, env, supabase });
  return searchBusinesses({ query, near, env, fetchImpl });
}

const GROOMER_ROW_FIELDS =
  'id, google_place_id, name, salon, address, lat, lng, phone, website, rating, review_count';

export function mapGroomerRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    googlePlaceId: row.google_place_id || '',
    name: row.name || '',
    salon: row.salon || '',
    address: row.address || '',
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    phone: row.phone || '',
    website: row.website || '',
    rating: row.rating ?? null,
    reviewCount: row.review_count ?? null,
  };
}

export async function linkGroomerBusinessFromPlace({
  accessToken,
  placeId,
  env = process.env,
  fetchImpl = fetch,
  supabase,
} = {}) {
  const { supabase: client } = await requireGroomerSession({ accessToken, env, supabase });

  const cleanedPlaceId = String(placeId || '').trim();
  if (!cleanedPlaceId) {
    throw new GroomerBusinessError(
      'Choose a business from the results.',
      400,
      'GROOMER_BUSINESS_PLACE_ID_REQUIRED',
    );
  }

  const details = await placeBusinessDetails({ placeId: cleanedPlaceId, env, fetchImpl });
  if (!details.name) {
    throw new GroomerBusinessError(
      'That business is missing a name on Google.',
      422,
      'GROOMER_BUSINESS_NAME_MISSING',
    );
  }

  const row = {
    google_place_id: details.placeId,
    name: details.name,
    salon: details.name,
    address: details.address,
    lat: details.lat,
    lng: details.lng,
    // PostGIS point — lng first, then lat, matching the seed script.
    location: `SRID=4326;POINT(${details.lng} ${details.lat})`,
    phone: details.phone,
    website: details.website,
    rating: details.rating,
    review_count: details.reviewCount,
  };

  // Upsert on the unique google_place_id so re-adding an existing (seeded or
  // previously added) business claims it instead of duplicating.
  const { data, error } = await client
    .from('groomers')
    .upsert(row, { onConflict: 'google_place_id' })
    .select(GROOMER_ROW_FIELDS)
    .single();

  if (error) {
    throw new GroomerBusinessError(
      'Could not save that business. Try again.',
      502,
      'GROOMER_BUSINESS_UPSERT_FAILED',
    );
  }

  return mapGroomerRow(data);
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

function bearerToken(event) {
  return String(event.headers?.authorization || event.headers?.Authorization || '')
    .replace(/^Bearer\s+/i, '')
    .trim();
}

export async function handleGroomerBusinessSearchEvent(event, env = process.env) {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method Not Allowed' });
  try {
    const { query, near } = JSON.parse(event.body || '{}');
    const results = await searchGroomerBusinesses({
      accessToken: bearerToken(event),
      query,
      near,
      env,
    });
    return jsonResponse(200, { results });
  } catch (error) {
    const publicError = toPublicGroomerBusinessError(error);
    return jsonResponse(publicError.statusCode, publicError.body);
  }
}

export async function handleGroomerBusinessLinkEvent(event, env = process.env) {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method Not Allowed' });
  try {
    const { placeId } = JSON.parse(event.body || '{}');
    const groomer = await linkGroomerBusinessFromPlace({
      accessToken: bearerToken(event),
      placeId,
      env,
    });
    return jsonResponse(200, { groomer });
  } catch (error) {
    const publicError = toPublicGroomerBusinessError(error);
    return jsonResponse(publicError.statusCode, publicError.body);
  }
}

export function toPublicGroomerBusinessError(error) {
  if (error instanceof GroomerBusinessError) {
    return { statusCode: error.statusCode, body: { code: error.code, error: error.publicMessage } };
  }
  if (error instanceof GooglePlacesError) {
    return toPublicGooglePlacesError(error);
  }
  return {
    statusCode: 500,
    body: { code: 'GROOMER_BUSINESS_ERROR', error: 'Could not complete that request.' },
  };
}
