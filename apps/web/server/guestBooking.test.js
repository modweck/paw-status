import { describe, expect, it } from 'vitest';

import { buildGuestBookingRows, hashGuestClaimToken } from './guestBooking.js';

const input = {
  customerEmail: ' owner@example.com ',
  customerName: ' Alex ',
  customerPhone: ' +12125551212 ',
  customerNotes: ' Please text before confirming. ',
  dogBreed: ' Mini poodle ',
  dogName: ' Mochi ',
  dogNotes: ' Use fragrance-free shampoo. ',
  dogSize: 'small',
  groomerId: 'groomer-1',
  preferredWindows: [
    { type: 'first-available' },
    { type: 'preferred-date', date: '2026-06-05', timeOfDay: 'morning' },
    { type: 'backup-date', date: '2026-06-07', timeOfDay: 'afternoon' },
  ],
  service: ' bath-brush ',
};

describe('guest booking server helpers', () => {
  it('builds customer, dog, and appointment request rows for a guest submission', () => {
    const rows = buildGuestBookingRows(input, {
      claimToken: 'claim-token-1',
      groomer: {
        id: 'groomer-1',
        website: 'https://pawhouse.example/book',
      },
      now: new Date('2026-05-19T20:00:00.000Z'),
    });

    expect(rows.customer).toEqual({
      auth_user_id: null,
      email: 'owner@example.com',
      name: 'Alex',
      phone: '+12125551212',
    });
    expect(rows.dog).toEqual({
      breed: 'Mini poodle',
      name: 'Mochi',
      notes: 'Use fragrance-free shampoo.',
      size: 'small',
    });
    expect(rows.request).toEqual({
      customer_notes: 'Please text before confirming.',
      external_booking_url: 'https://pawhouse.example/book',
      groomer_id: 'groomer-1',
      guest_claim_expires_at: '2026-05-26T20:00:00.000Z',
      guest_claim_token_hash: hashGuestClaimToken('claim-token-1'),
      preferred_windows: [
        { type: 'first-available' },
        { type: 'preferred-date', date: '2026-06-05', timeOfDay: 'morning' },
        { type: 'backup-date', date: '2026-06-07', timeOfDay: 'afternoon' },
      ],
      service: 'bath-brush',
      status: 'external_handoff',
    });
  });

  it('rejects invalid dog size categories before writing rows', () => {
    expect(() =>
      buildGuestBookingRows(
        {
          ...input,
          dogSize: 'giant',
        },
        {
          claimToken: 'claim-token-1',
          groomer: { id: 'groomer-1', website: '' },
          now: new Date('2026-05-19T20:00:00.000Z'),
        },
      ),
    ).toThrow('Choose a valid dog size.');
  });
});
