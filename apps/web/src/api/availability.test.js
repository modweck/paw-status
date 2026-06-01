import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchAvailableSlots } from './availability.js';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  };
}

describe('fetchAvailableSlots', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('forwards the detected browser timezone in the request URL', async () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => ({
      resolvedOptions: () => ({ timeZone: 'America/Chicago' }),
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(jsonResponse({ slots: [{ iso: '2024-01-15T09:00:00.000Z' }] })),
    );

    const slots = await fetchAvailableSlots('groomer-1');

    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('groomerId=groomer-1');
    expect(url).toContain('timezone=America%2FChicago');
    expect(slots).toEqual([{ iso: '2024-01-15T09:00:00.000Z' }]);
  });

  it('includes serviceId in the query when provided', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(jsonResponse({ slots: [] })),
    );

    await fetchAvailableSlots('groomer-2', 'full-groom');

    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('groomerId=groomer-2');
    expect(url).toContain('serviceId=full-groom');
  });

  it('returns an empty array when the response body has slots: []', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(jsonResponse({ slots: [] })),
    );

    await expect(fetchAvailableSlots('groomer-3')).resolves.toEqual([]);
  });

  it('throws an Error whose message includes the HTTP status code on non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        jsonResponse({ error: 'Internal Server Error' }, { ok: false, status: 500 }),
      ),
    );

    await expect(fetchAvailableSlots('groomer-4')).rejects.toThrow('500');
  });

  it('falls back to America/New_York when Intl.DateTimeFormat throws', async () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('Intl not available');
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(jsonResponse({ slots: [] })),
    );

    await fetchAvailableSlots('groomer-5');

    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('timezone=America%2FNew_York');
  });
});
