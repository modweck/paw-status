import { afterEach, describe, expect, it, vi } from 'vitest';

const getSupabaseClient = vi.fn();

vi.mock('../lib/supabaseClient.js', () => ({
  getSupabaseClient: () => getSupabaseClient(),
}));

import { detectNeighborhood, fetchNearbyGroomers, formatDistance, mapNearbyGroomer } from './groomers.js';

describe('groomer mapping', () => {
  afterEach(() => {
    getSupabaseClient.mockReset();
  });

  it('maps Supabase nearby_groomers rows to UI groomer cards', () => {
    expect(
      mapNearbyGroomer({
        id: 'groomer-1',
        google_place_id: 'ChIJ-test-place',
        name: 'Paw House',
        address: '1420 Lexington Ave, New York, NY',
        rating: 4.86,
        review_count: 22,
        services: ['full-groom', 'nail-trim'],
        distance_meters: 1609.34,
        photo_url: 'https://example.com/photo.jpg',
        website: 'https://example.com',
      }),
    ).toMatchObject({
      id: 'groomer-1',
      googlePlaceId: 'ChIJ-test-place',
      name: 'Paw House',
      neighborhood: 'Upper East Side',
      rating: '4.9',
      reviewCount: 22,
      services: ['full-groom', 'nail-trim'],
      distanceLabel: '1.0 mi',
      photoUrl: 'https://example.com/photo.jpg',
      photoSource: 'owned',
      website: 'https://example.com',
    });
  });

  it('marks Google Places photos as on-demand when no owned photo exists', () => {
    expect(
      mapNearbyGroomer({
        google_place_id: 'ChIJ-google-place',
        name: 'Paw House',
        address: '1420 Lexington Ave, New York, NY',
        rating: 4.86,
        review_count: 22,
      }),
    ).toMatchObject({
      id: 'ChIJ-google-place',
      googlePlaceId: 'ChIJ-google-place',
      photoUrl: '',
      photoSource: 'google',
    });
  });

  it('does not treat seeded Google media URLs as owned photos', () => {
    expect(
      mapNearbyGroomer({
        google_place_id: 'ChIJ-google-place',
        name: 'Paw House',
        photo_url:
          'https://places.googleapis.com/v1/places/ChIJ-google-place/photos/photo/media?maxWidthPx=600&key=secret',
      }),
    ).toMatchObject({
      googlePlaceId: 'ChIJ-google-place',
      photoUrl: '',
      photoSource: 'google',
    });
  });

  it('keeps public address parsing isolated from components', () => {
    expect(detectNeighborhood('170 Mercer St, New York, NY')).toBe('SoHo');
    expect(detectNeighborhood('unknown address')).toBe('NYC');
    expect(formatDistance(undefined)).toBe('');
  });

  it('returns an empty list instead of fake groomers when coordinates are missing', async () => {
    await expect(
      fetchNearbyGroomers({
        radiusMeters: 4828,
      }),
    ).resolves.toEqual([]);
  });

  it('passes the selected service into the nearby groomer RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'groomer-1',
          name: 'Paw House',
          services: ['full-groom'],
        },
      ],
      error: null,
    });
    getSupabaseClient.mockReturnValue({ rpc });

    const groomers = await fetchNearbyGroomers({
      lat: 40.72,
      lng: -73.99,
      radiusMeters: 4828,
      serviceId: 'full-groom',
    });

    expect(rpc).toHaveBeenCalledWith('nearby_groomers', {
      user_lat: 40.72,
      user_lng: -73.99,
      radius_meters: 4828,
      service_id: 'full-groom',
    });
    expect(groomers[0]).toMatchObject({
      id: 'groomer-1',
      services: ['full-groom'],
    });
  });

  it('falls back to the legacy nearby groomer RPC while the service migration is unapplied', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: {
          message:
            'Could not find the function public.nearby_groomers(radius_meters, service_id, user_lat, user_lng) in the schema cache',
        },
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'groomer-1',
            name: 'Paw House',
          },
        ],
        error: null,
      });
    getSupabaseClient.mockReturnValue({ rpc });

    const groomers = await fetchNearbyGroomers({
      lat: 40.72,
      lng: -73.99,
      radiusMeters: 4828,
      serviceId: 'full-groom',
    });

    expect(rpc).toHaveBeenNthCalledWith(1, 'nearby_groomers', {
      user_lat: 40.72,
      user_lng: -73.99,
      radius_meters: 4828,
      service_id: 'full-groom',
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'nearby_groomers', {
      user_lat: 40.72,
      user_lng: -73.99,
      radius_meters: 4828,
    });
    expect(groomers).toEqual([
      expect.objectContaining({
        id: 'groomer-1',
      }),
    ]);
  });
});
