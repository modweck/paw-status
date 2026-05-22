import { describe, expect, it, vi } from 'vitest';

import {
  GooglePlacesPhotoError,
  fetchGooglePlacePhoto,
  normalizeMaxWidth,
} from './googlePlacesPhoto.js';

describe('Google Places photo resolver', () => {
  it('normalizes requested thumbnail width to a safe range', () => {
    expect(normalizeMaxWidth(undefined)).toBe(600);
    expect(normalizeMaxWidth('12')).toBe(80);
    expect(normalizeMaxWidth('900')).toBe(900);
    expect(normalizeMaxWidth('9999')).toBe(1600);
  });

  it('fetches a fresh Google photo URI and attribution without exposing the API key', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          photos: [
            {
              name: 'places/ChIJ-test/photos/photo-resource',
              authorAttributions: [
                {
                  displayName: 'Photo Owner',
                  uri: '//maps.google.com/maps/contrib/123',
                  photoUri: '//lh3.googleusercontent.com/avatar',
                },
              ],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          photoUri: 'https://lh3.googleusercontent.com/photo',
        }),
      });

    const result = await fetchGooglePlacePhoto({
      apiKey: 'secret-google-key',
      fetchImpl,
      maxWidth: 720,
      placeId: 'ChIJ-test',
    });

    expect(result).toEqual({
      photoUri: 'https://lh3.googleusercontent.com/photo',
      authorAttributions: [
        {
          displayName: 'Photo Owner',
          uri: 'https://maps.google.com/maps/contrib/123',
          photoUri: 'https://lh3.googleusercontent.com/avatar',
        },
      ],
      source: 'google_maps',
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://places.googleapis.com/v1/places/ChIJ-test',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Goog-Api-Key': 'secret-google-key',
          'X-Goog-FieldMask': 'id,photos',
        }),
      }),
    );
    expect(fetchImpl.mock.calls[1][0]).toContain('maxWidthPx=720');
    expect(fetchImpl.mock.calls[1][0]).toContain('skipHttpRedirect=true');
    expect(result.photoUri).not.toContain('secret-google-key');
  });

  it('returns a typed 404 error when Google has no photo for the place', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ photos: [] }),
    });

    await expect(
      fetchGooglePlacePhoto({
        apiKey: 'secret-google-key',
        fetchImpl,
        placeId: 'ChIJ-test',
      }),
    ).rejects.toMatchObject({
      name: 'GooglePlacesPhotoError',
      statusCode: 404,
      publicMessage: 'No Google Places photo found for this groomer.',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(GooglePlacesPhotoError).toBeDefined();
  });
});
