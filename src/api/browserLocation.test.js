import { describe, expect, it, vi } from 'vitest';

import { getBrowserLocation } from './browserLocation.js';

describe('browser location', () => {
  it('resolves browser coordinates when geolocation succeeds', async () => {
    const geolocation = {
      getCurrentPosition: vi.fn((success) => {
        success({
          coords: {
            latitude: 40.72,
            longitude: -73.99,
          },
        });
      }),
    };

    await expect(getBrowserLocation({ geolocation })).resolves.toEqual({
      lat: 40.72,
      lng: -73.99,
    });
  });

  it('returns null when geolocation is unavailable or denied', async () => {
    await expect(getBrowserLocation({ geolocation: null })).resolves.toBeNull();

    const geolocation = {
      getCurrentPosition: vi.fn((success, error) => {
        error(new Error('denied'));
      }),
    };

    await expect(getBrowserLocation({ geolocation })).resolves.toBeNull();
  });
});
