// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  linkGroomerBusinessFromPlace,
  searchGroomerBusinesses,
} from './groomerBusiness.js';

const env = { GOOGLE_PLACES_API_KEY: 'fake-key' };

function okJson(body) {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

function makeSupabase({ user = { id: 'auth-1' }, upsertRow } = {}) {
  const single = vi.fn().mockResolvedValue({ data: upsertRow, error: null });
  const select = vi.fn(() => ({ single }));
  const upsert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ upsert }));
  const getUser = vi.fn().mockResolvedValue(
    user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'bad token' } },
  );
  return { auth: { getUser }, from, spies: { getUser, from, upsert, select, single } };
}

const detailsPayload = {
  id: 'place-1',
  displayName: { text: 'Paw House Grooming' },
  formattedAddress: '123 Main St, Brooklyn, NY',
  location: { latitude: 40.7, longitude: -73.95 },
  nationalPhoneNumber: '+1 212 555 1212',
  websiteUri: 'https://pawhouse.example',
  rating: 4.8,
  userRatingCount: 120,
};

const upsertedRow = {
  id: 'groomer-1',
  google_place_id: 'place-1',
  name: 'Paw House Grooming',
  salon: 'Paw House Grooming',
  address: '123 Main St, Brooklyn, NY',
  lat: 40.7,
  lng: -73.95,
  phone: '+1 212 555 1212',
  website: 'https://pawhouse.example',
  rating: 4.8,
  review_count: 120,
};

describe('searchGroomerBusinesses', () => {
  it('rejects without an access token', async () => {
    await expect(searchGroomerBusinesses({ query: 'paw house', env })).rejects.toMatchObject({
      code: 'GROOMER_BUSINESS_AUTH_REQUIRED',
    });
  });

  it('returns candidates for a valid session', async () => {
    const supabase = makeSupabase();
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      okJson({ places: [{ id: 'p1', displayName: { text: 'Paw House' }, formattedAddress: 'A', rating: 4.5, userRatingCount: 10 }] }),
    );

    const results = await searchGroomerBusinesses({
      accessToken: 'token',
      query: 'paw house',
      env,
      fetchImpl,
      supabase,
    });

    expect(supabase.spies.getUser).toHaveBeenCalledWith('token');
    expect(results).toEqual([{ placeId: 'p1', name: 'Paw House', address: 'A', rating: 4.5, reviewCount: 10 }]);
  });
});

describe('linkGroomerBusinessFromPlace', () => {
  it('rejects an invalid session', async () => {
    const supabase = makeSupabase({ user: null });
    await expect(
      linkGroomerBusinessFromPlace({ accessToken: 'bad', placeId: 'place-1', env, fetchImpl: vi.fn(), supabase }),
    ).rejects.toMatchObject({ code: 'GROOMER_BUSINESS_AUTH_INVALID' });
  });

  it('rejects an empty placeId', async () => {
    const supabase = makeSupabase();
    await expect(
      linkGroomerBusinessFromPlace({ accessToken: 'token', placeId: '  ', env, fetchImpl: vi.fn(), supabase }),
    ).rejects.toMatchObject({ code: 'GROOMER_BUSINESS_PLACE_ID_REQUIRED' });
  });

  it('fetches details and upserts a groomers row with a PostGIS point', async () => {
    const supabase = makeSupabase({ upsertRow: upsertedRow });
    const fetchImpl = vi.fn().mockResolvedValueOnce(okJson(detailsPayload));

    const groomer = await linkGroomerBusinessFromPlace({
      accessToken: 'token',
      placeId: 'place-1',
      env,
      fetchImpl,
      supabase,
    });

    const row = supabase.spies.upsert.mock.calls[0][0];
    expect(row).toMatchObject({
      google_place_id: 'place-1',
      name: 'Paw House Grooming',
      salon: 'Paw House Grooming',
      address: '123 Main St, Brooklyn, NY',
      lat: 40.7,
      lng: -73.95,
      location: 'SRID=4326;POINT(-73.95 40.7)',
      phone: '+1 212 555 1212',
      website: 'https://pawhouse.example',
      rating: 4.8,
      review_count: 120,
    });
    expect(supabase.spies.upsert.mock.calls[0][1]).toEqual({ onConflict: 'google_place_id' });
    expect(groomer).toMatchObject({ id: 'groomer-1', googlePlaceId: 'place-1', name: 'Paw House Grooming' });
  });
});
