import { afterEach, describe, expect, it, vi } from 'vitest';

import { geocodeAddress, reverseGeocodeLocation, suggestAddresses } from './geocoding.js';

describe('geocoding api', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to display_name when no structured address is returned', async () => {
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
    expect(fetchMock.mock.calls[0][0]).toContain('countrycodes=us');
    expect(fetchMock.mock.calls[0][0]).toContain('addressdetails=1');
    expect(fetchMock.mock.calls[0][0]).toContain('dedupe=1');
    expect(fetchMock.mock.calls[0][0]).toMatch(/q=1000(\+|%20)5th/);
  });

  it('renders a clean street + city + state ZIP label when Nominatim returns structured address fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            lat: '40.7667625',
            lon: '-73.9531214',
            display_name:
              '515, East 72nd Street, Lenox Hill, Manhattan Community Board 8, Manhattan, New York County, New York, 10021, United States',
            address: {
              house_number: '515',
              road: 'East 72nd Street',
              neighbourhood: 'Lenox Hill',
              borough: 'Manhattan',
              city: 'City of New York',
              state: 'New York',
              postcode: '10021',
              country_code: 'us',
            },
          },
        ]),
    });

    const [suggestion] = await suggestAddresses('515 east 72nd street');
    expect(suggestion.displayName).toBe('515 East 72nd Street, City of New York, NY 10021');
    expect(suggestion.lat).toBe(40.7667625);
    expect(suggestion.lng).toBe(-73.9531214);
  });

  it('prefers borough over suburb when both are present (outer-borough NYC)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            lat: '40.71',
            lon: '-73.96',
            display_name: 'whatever',
            address: {
              house_number: '100',
              road: 'Bedford Ave',
              suburb: 'Williamsburg',
              borough: 'Brooklyn',
              state: 'New York',
              postcode: '11211',
            },
          },
        ]),
    });

    const [suggestion] = await suggestAddresses('100 Bedford Ave');
    expect(suggestion.displayName).toBe('100 Bedford Ave, Brooklyn, NY 11211');
  });

  it('falls through to borough / neighbourhood when city/town/village are absent', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            lat: '40.6',
            lon: '-73.9',
            display_name: 'whatever',
            address: {
              house_number: '1',
              road: 'Test St',
              borough: 'Brooklyn',
              state: 'New York',
              postcode: '11201',
            },
          },
        ]),
    });

    const [suggestion] = await suggestAddresses('1 Test St');
    expect(suggestion.displayName).toBe('1 Test St, Brooklyn, NY 11201');
  });

  it('preserves the full state name when it is not a US state we recognise', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            lat: '0',
            lon: '0',
            display_name: 'whatever',
            address: {
              house_number: '1',
              road: 'Test St',
              city: 'Somewhere',
              state: 'Puerto Rico',
              postcode: '00901',
            },
          },
        ]),
    });

    const [suggestion] = await suggestAddresses('1 Test St');
    expect(suggestion.displayName).toBe('1 Test St, Somewhere, Puerto Rico 00901');
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
            address: {
              city: 'Stamford',
              state: 'Connecticut',
              postcode: '06902',
            },
          },
        ]),
    });

    await expect(geocodeAddress('06902')).resolves.toEqual({
      lat: 41.0534,
      lng: -73.5387,
      displayName: 'Stamford, CT 06902',
    });
    expect(fetchMock.mock.calls[0][0]).toContain('limit=1');
    expect(fetchMock.mock.calls[0][0]).toContain('countrycodes=us');
  });

  it('adds a viewbox + bounded=0 when a near={lat,lng} bias is provided', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    await suggestAddresses('515 east 72nd street', { near: { lat: 40.768, lng: -73.958 } });

    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('bounded=0');
    // Nominatim expects viewbox=lonMin,latMax,lonMax,latMin in that order.
    // For lat=40.768, lng=-73.958 with HALF_DEGREES=0.5:
    //   lonMin = -74.458, latMax = 41.268, lonMax = -73.458, latMin = 40.268
    const expectedViewbox = encodeURIComponent('-74.458,41.268,-73.458,40.268');
    expect(url).toContain(`viewbox=${expectedViewbox}`);
  });

  it('skips the viewbox parameter when no bias is provided', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    await suggestAddresses('515 east 72nd street');

    const url = fetchMock.mock.calls[0][0];
    expect(url).not.toContain('viewbox');
    expect(url).not.toContain('bounded');
  });

  it('forwards the near bias to single-result geocodeAddress as well', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            lat: '40.7667625',
            lon: '-73.9531214',
            display_name: '515 East 72nd Street',
            address: {
              house_number: '515',
              road: 'East 72nd Street',
              city: 'New York',
              state: 'New York',
              postcode: '10021',
            },
          },
        ]),
    });

    await geocodeAddress('515 east 72nd street', { near: { lat: 40.768, lng: -73.958 } });

    expect(fetchMock.mock.calls[0][0]).toContain('viewbox=');
    expect(fetchMock.mock.calls[0][0]).toContain('bounded=0');
  });

  it('reverse-geocode returns the same shaped row', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
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
    });

    await expect(reverseGeocodeLocation({ lat: 40.775, lng: -73.965 })).resolves.toEqual({
      lat: 40.775,
      lng: -73.965,
      displayName: '5th Avenue, Manhattan, NY 10028',
    });
  });
});
