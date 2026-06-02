import { afterEach, describe, expect, it, vi } from 'vitest';

import { linkGroomerBusiness, searchGroomerBusinesses } from './groomerBusiness.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(body, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) });
}

describe('groomerBusiness client', () => {
  it('requires an access token to search', async () => {
    await expect(searchGroomerBusinesses('', 'paw house')).rejects.toThrow('Sign in');
  });

  it('searches with the bearer token and returns results', async () => {
    const fetchMock = mockFetch({ results: [{ placeId: 'p1', name: 'Paw House' }] });
    vi.stubGlobal('fetch', fetchMock);

    const results = await searchGroomerBusinesses('token-1', 'paw house');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/groomer-business-search',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-1' }),
      }),
    );
    expect(results).toEqual([{ placeId: 'p1', name: 'Paw House' }]);
  });

  it('links a place and returns the groomer', async () => {
    const fetchMock = mockFetch({ groomer: { id: 'g1', name: 'Paw House' } });
    vi.stubGlobal('fetch', fetchMock);

    const groomer = await linkGroomerBusiness('token-1', 'place-1');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/groomer-business-link',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-1' }),
      }),
    );
    expect(groomer).toEqual({ id: 'g1', name: 'Paw House' });
  });

  it('throws the server error message on failure', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'That business is missing a name on Google.' }, false));
    await expect(linkGroomerBusiness('token-1', 'place-1')).rejects.toThrow(
      'That business is missing a name on Google.',
    );
  });
});
