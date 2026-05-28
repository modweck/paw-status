import { describe, expect, it, vi } from 'vitest';

import {
  geocodeAddress,
  resolvePlace,
  reverseGeocodeLocation,
  suggestAddresses,
} from './geocoding.js';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  };
}

describe('suggestAddresses', () => {
  it('returns an empty list when the query is shorter than 3 characters', async () => {
    const fetcher = vi.fn();
    await expect(suggestAddresses('ab', { fetcher })).resolves.toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('POSTs the trimmed query and near bias to the autocomplete proxy', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        suggestions: [
          {
            placeId: 'place-1',
            displayName: '515 East 72nd Street, New York, NY 10021',
            mainText: '515 East 72nd Street',
            secondaryText: 'New York, NY 10021',
          },
        ],
      }),
    );

    const suggestions = await suggestAddresses('  515 east 72  ', {
      near: { lat: 40.768, lng: -73.958 },
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith(
      '/api/places/autocomplete',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          input: '515 east 72',
          near: { lat: 40.768, lng: -73.958 },
        }),
      }),
    );
    expect(suggestions).toEqual([
      {
        placeId: 'place-1',
        displayName: '515 East 72nd Street, New York, NY 10021',
        mainText: '515 East 72nd Street',
        secondaryText: 'New York, NY 10021',
      },
    ]);
  });

  it('sends near=null when no bias is provided', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(jsonResponse({ suggestions: [] }));
    await suggestAddresses('main street', { fetcher });
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.near).toBeNull();
  });

  it('drops suggestions without a placeId defensively', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        suggestions: [
          { placeId: '', displayName: 'no id' },
          { placeId: 'good-1', displayName: 'good' },
          null,
        ],
      }),
    );

    const suggestions = await suggestAddresses('whatever', { fetcher });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].placeId).toBe('good-1');
  });

  it('throws a user-safe error when the proxy returns non-2xx', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      jsonResponse({ error: 'Address search is temporarily unavailable.' }, { ok: false, status: 502 }),
    );

    await expect(suggestAddresses('anything', { fetcher })).rejects.toThrow(
      'Address search is temporarily unavailable.',
    );
  });
});

describe('resolvePlace', () => {
  it('returns null for empty placeIds without hitting the network', async () => {
    const fetcher = vi.fn();
    await expect(resolvePlace('', { fetcher })).resolves.toBeNull();
    await expect(resolvePlace(undefined, { fetcher })).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('GETs the details proxy and shapes the response to {lat,lng,displayName}', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        place: {
          lat: 40.7667625,
          lng: -73.9531214,
          displayName: '515 E 72nd St, New York, NY 10021, USA',
        },
      }),
    );

    const place = await resolvePlace('place-1', { fetcher });
    expect(fetcher).toHaveBeenCalledWith('/api/places/details?placeId=place-1');
    expect(place).toEqual({
      lat: 40.7667625,
      lng: -73.9531214,
      displayName: '515 E 72nd St, New York, NY 10021, USA',
    });
  });

  it('throws when the details proxy returns a non-2xx', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'That address could not be found.' }, { ok: false, status: 404 }));

    await expect(resolvePlace('missing', { fetcher })).rejects.toThrow(
      'That address could not be found.',
    );
  });
});

describe('geocodeAddress (form-submit fallback when no suggestion was picked)', () => {
  it('takes the top autocomplete suggestion and resolves its details', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          suggestions: [
            {
              placeId: 'place-1',
              displayName: '1000 5th Ave, New York, NY 10028',
              mainText: '1000 5th Ave',
              secondaryText: 'New York, NY 10028',
            },
            { placeId: 'place-2', displayName: 'second match' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          place: {
            lat: 40.7794,
            lng: -73.9632,
            displayName: '1000 5th Ave, New York, NY 10028, USA',
          },
        }),
      );

    const result = await geocodeAddress('1000 5th ave', {
      near: { lat: 40.7, lng: -74 },
      fetcher,
    });

    expect(fetcher.mock.calls[0][0]).toBe('/api/places/autocomplete');
    expect(fetcher.mock.calls[1][0]).toBe('/api/places/details?placeId=place-1');
    expect(result).toEqual({
      lat: 40.7794,
      lng: -73.9632,
      displayName: '1000 5th Ave, New York, NY 10028, USA',
    });
  });

  it('returns null when there are no autocomplete suggestions', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(jsonResponse({ suggestions: [] }));
    await expect(geocodeAddress('xxxxxxxxxxxx', { fetcher })).resolves.toBeNull();
  });

  it('returns null for empty addresses without hitting the network', async () => {
    const fetcher = vi.fn();
    await expect(geocodeAddress('   ', { fetcher })).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('reverseGeocodeLocation (still on Nominatim for low-volume label lookup)', () => {
  it('shapes the Nominatim response into a clean US-style label', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        lat: '40.775',
        lon: '-73.965',
        display_name: 'Upper East Side, Manhattan, NY',
        address: {
          road: '5th Avenue',
          borough: 'Manhattan',
          state: 'New York',
          postcode: '10028',
        },
      }),
    );

    await expect(reverseGeocodeLocation({ lat: 40.775, lng: -73.965 })).resolves.toEqual({
      lat: 40.775,
      lng: -73.965,
      displayName: '5th Avenue, Manhattan, NY 10028',
    });

    globalThis.fetch.mockRestore();
  });

  it('returns null for invalid coordinates', async () => {
    await expect(reverseGeocodeLocation({ lat: NaN, lng: 0 })).resolves.toBeNull();
  });
});
