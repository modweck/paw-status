// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  autocompletePlaces,
  GooglePlacesError,
  placeDetails,
  toPublicGooglePlacesError,
} from './googlePlaces.js';

const env = { GOOGLE_PLACES_API_KEY: 'fake-key' };

function okJson(body) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  };
}

describe('autocompletePlaces', () => {
  it('returns [] for queries shorter than 3 characters without calling Google', async () => {
    const fetchImpl = vi.fn();
    await expect(autocompletePlaces({ input: 'ab', env, fetchImpl })).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts to the Google Places autocomplete endpoint with the supplied bias and shapes the result', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      okJson({
        suggestions: [
          {
            placePrediction: {
              placeId: 'place-1',
              text: { text: '515 East 72nd Street, New York, NY 10021, USA' },
              structuredFormat: {
                mainText: { text: '515 East 72nd Street' },
                secondaryText: { text: 'New York, NY 10021, USA' },
              },
            },
          },
        ],
      }),
    );

    const suggestions = await autocompletePlaces({
      input: '  515 east 72  ',
      near: { lat: 40.768, lng: -73.958 },
      env,
      fetchImpl,
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Goog-Api-Key']).toBe('fake-key');
    expect(init.headers['X-Goog-FieldMask']).toContain('suggestions.placePrediction.placeId');

    const body = JSON.parse(init.body);
    expect(body.input).toBe('515 east 72');
    expect(body.includedRegionCodes).toEqual(['us']);
    expect(body.locationBias.circle.center).toEqual({
      latitude: 40.768,
      longitude: -73.958,
    });

    expect(suggestions).toEqual([
      {
        placeId: 'place-1',
        displayName: '515 East 72nd Street, New York, NY 10021, USA',
        mainText: '515 East 72nd Street',
        secondaryText: 'New York, NY 10021, USA',
      },
    ]);
  });

  it('falls back to the default NYC bias when no near is provided', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(okJson({ suggestions: [] }));
    await autocompletePlaces({ input: 'anything', env, fetchImpl });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.locationBias.circle.center).toEqual({
      latitude: 40.768,
      longitude: -73.958,
    });
  });

  it('drops malformed Google suggestions instead of leaking them to the caller', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      okJson({
        suggestions: [
          { placePrediction: { placeId: '', text: { text: 'no id' } } },
          { queryPrediction: { whatever: true } },
          {
            placePrediction: {
              placeId: 'good',
              text: { text: 'good place' },
              structuredFormat: {
                mainText: { text: 'good' },
                secondaryText: { text: 'place' },
              },
            },
          },
        ],
      }),
    );

    const suggestions = await autocompletePlaces({ input: 'anything', env, fetchImpl });
    expect(suggestions).toEqual([
      {
        placeId: 'good',
        displayName: 'good place',
        mainText: 'good',
        secondaryText: 'place',
      },
    ]);
  });

  it('throws GOOGLE_PLACES_CONFIG_MISSING when the env has no API key', async () => {
    await expect(
      autocompletePlaces({ input: 'anything', env: {}, fetchImpl: vi.fn() }),
    ).rejects.toMatchObject({ code: 'GOOGLE_PLACES_CONFIG_MISSING', statusCode: 500 });
  });

  it('throws GOOGLE_PLACES_UPSTREAM_ERROR on a non-2xx response', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: { message: 'internal' } }),
    });

    await expect(
      autocompletePlaces({ input: 'anything', env, fetchImpl }),
    ).rejects.toMatchObject({ code: 'GOOGLE_PLACES_UPSTREAM_ERROR', statusCode: 502 });
  });

  it('throws GOOGLE_PLACES_NETWORK_ERROR when fetch itself throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error('econnreset'));
    await expect(
      autocompletePlaces({ input: 'anything', env, fetchImpl }),
    ).rejects.toMatchObject({ code: 'GOOGLE_PLACES_NETWORK_ERROR', statusCode: 502 });
  });
});

describe('placeDetails', () => {
  it('throws PLACE_ID_REQUIRED for empty input without hitting Google', async () => {
    const fetchImpl = vi.fn();
    await expect(placeDetails({ placeId: '   ', env, fetchImpl })).rejects.toMatchObject({
      code: 'GOOGLE_PLACES_PLACE_ID_REQUIRED',
      statusCode: 400,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('GETs the place by id and shapes lat/lng + display name', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      okJson({
        location: { latitude: 40.7667625, longitude: -73.9531214 },
        formattedAddress: '515 E 72nd St, New York, NY 10021, USA',
      }),
    );

    const details = await placeDetails({ placeId: 'place-1', env, fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://places.googleapis.com/v1/places/place-1',
    );
    expect(fetchImpl.mock.calls[0][1].headers['X-Goog-Api-Key']).toBe('fake-key');
    expect(details).toEqual({
      lat: 40.7667625,
      lng: -73.9531214,
      displayName: '515 E 72nd St, New York, NY 10021, USA',
    });
  });

  it('maps a Google 404 to GOOGLE_PLACES_NOT_FOUND', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, json: () => Promise.resolve({}) });

    await expect(placeDetails({ placeId: 'missing', env, fetchImpl })).rejects.toMatchObject({
      code: 'GOOGLE_PLACES_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('throws GOOGLE_PLACES_LOCATION_MISSING when Google returns no lat/lng', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      okJson({ formattedAddress: 'somewhere with no coords' }),
    );

    await expect(placeDetails({ placeId: 'broken', env, fetchImpl })).rejects.toMatchObject({
      code: 'GOOGLE_PLACES_LOCATION_MISSING',
      statusCode: 404,
    });
  });
});

describe('toPublicGooglePlacesError', () => {
  it('maps a GooglePlacesError into the public response body', () => {
    const error = new GooglePlacesError(
      'You should not be here.',
      403,
      'GOOGLE_PLACES_FORBIDDEN',
    );
    expect(toPublicGooglePlacesError(error)).toEqual({
      statusCode: 403,
      body: {
        code: 'GOOGLE_PLACES_FORBIDDEN',
        error: 'You should not be here.',
      },
    });
  });

  it('falls back to a generic 500 for unknown errors', () => {
    expect(toPublicGooglePlacesError(new Error('boom'))).toEqual({
      statusCode: 500,
      body: { code: 'GOOGLE_PLACES_ERROR', error: 'Address search failed.' },
    });
  });
});
