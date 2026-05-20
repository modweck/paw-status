import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  claimGuestBookingRequest,
  createGuestBookingRequest,
  PENDING_GUEST_CLAIM_STORAGE_KEY,
} from './guestBooking.js';

describe('guest booking api', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts a guest booking packet to the Netlify function', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          request: { id: 'request-1', status: 'requested' },
          claimToken: 'claim-token-1',
          customerEmail: 'owner@example.com',
        }),
    });

    await expect(
      createGuestBookingRequest({
        customerName: 'Alex',
        customerEmail: 'owner@example.com',
        customerPhone: '+12125551212',
        dogName: 'Mochi',
        dogBreed: 'Mini poodle',
        dogSize: 'small',
        dogNotes: 'Use fragrance-free shampoo.',
        groomerId: 'groomer-1',
        service: 'bath-brush',
        preferredWindows: ['first-available'],
        customerNotes: 'Please text before confirming.',
      }),
    ).resolves.toMatchObject({
      request: { id: 'request-1' },
      claimToken: 'claim-token-1',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/guest-booking',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"dogSize":"small"'),
      }),
    );
    expect(PENDING_GUEST_CLAIM_STORAGE_KEY).toBe('paw-status:pending-guest-claim');
  });

  it('claims a pending guest booking with the signed-in access token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ claimed: true, requestId: 'request-1' }),
    });

    await expect(
      claimGuestBookingRequest({
        accessToken: 'access-token-1',
        claimToken: 'claim-token-1',
      }),
    ).resolves.toEqual({ claimed: true, requestId: 'request-1' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/guest-booking-claim',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer access-token-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ claimToken: 'claim-token-1' }),
      }),
    );
  });
});
