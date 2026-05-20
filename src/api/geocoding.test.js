import { afterEach, describe, expect, it, vi } from 'vitest';

import { geocodeAddress, suggestAddresses } from './geocoding.js';

describe('geocoding api', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps address suggestions from Nominatim rows', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            lat: '40.775',
            lon: '-73.965',
            display_name: '1000 5th Ave, New York, NY 10028',
          },
          {
            lat: '40.776',
            lon: '-73.963',
            display_name: '5th Avenue, New York, NY',
          },
        ]),
    });

    await expect(suggestAddresses('1000 5th')).resolves.toEqual([
      {
        lat: 40.775,
        lng: -73.965,
        displayName: '1000 5th Ave, New York, NY 10028',
      },
      {
        lat: 40.776,
        lng: -73.963,
        displayName: '5th Avenue, New York, NY',
      },
    ]);
    expect(fetchMock.mock.calls[0][0]).toContain('limit=5');
    expect(fetchMock.mock.calls[0][0]).toContain('1000%205th');
  });

  it('does not request suggestions until the user has typed enough text', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(suggestAddresses('12')).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still geocodes the submitted address as a single result', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            lat: '41.0534',
            lon: '-73.5387',
            display_name: 'Stamford, CT 06902',
          },
        ]),
    });

    await expect(geocodeAddress('06902')).resolves.toEqual({
      lat: 41.0534,
      lng: -73.5387,
      displayName: 'Stamford, CT 06902',
    });
    expect(fetchMock.mock.calls[0][0]).toContain('limit=1');
  });
});
