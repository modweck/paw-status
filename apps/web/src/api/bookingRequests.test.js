import { describe, expect, it, vi } from 'vitest';

import {
  buildPreferredWindows,
  createBookingRequest,
  mapBookingRequestRow,
  TIME_OF_DAY_OPTIONS,
} from './bookingRequests.js';

const customer = {
  id: 'customer-1',
  authUserId: 'auth-user-1',
};

const dog = {
  id: 'dog-1',
  customerId: customer.id,
  name: 'Mochi',
};

const groomer = {
  id: 'groomer-1',
  name: 'Paw House',
  website: 'https://pawhouse.example/book',
};

function makeInsertClient(row) {
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));

  return {
    from,
    spies: { from, insert, select, single },
  };
}

describe('booking request api', () => {
  it('maps database booking request rows to UI records', () => {
    expect(
      mapBookingRequestRow({
        id: 'request-1',
        customer_id: customer.id,
        dog_id: dog.id,
        groomer_id: groomer.id,
        service: 'full-groom',
        preferred_windows: ['weekday-evening', 'weekend'],
        customer_notes: 'Call before confirming.',
        status: 'external_handoff',
        external_booking_url: groomer.website,
        created_at: '2026-05-16T00:00:00.000Z',
      }),
    ).toEqual({
      id: 'request-1',
      customerId: customer.id,
      dogId: dog.id,
      groomerId: groomer.id,
      service: 'full-groom',
      preferredWindows: ['weekday-evening', 'weekend'],
      customerNotes: 'Call before confirming.',
      status: 'external_handoff',
      externalBookingUrl: groomer.website,
      createdAt: '2026-05-16T00:00:00.000Z',
    });
  });

  it('creates an external handoff request for an owned dog and selected groomer', async () => {
    const preferredWindows = [
      { type: 'first-available' },
      { type: 'preferred-date', date: '2026-06-05', timeOfDay: 'morning' },
      { type: 'backup-date', date: '2026-06-07', timeOfDay: 'afternoon' },
    ];
    const client = makeInsertClient({
      id: 'request-1',
      customer_id: customer.id,
      dog_id: dog.id,
      groomer_id: groomer.id,
      service: 'full-groom',
      preferred_windows: preferredWindows,
      customer_notes: 'Call before confirming.',
      status: 'external_handoff',
      external_booking_url: groomer.website,
    });

    const request = await createBookingRequest(client, customer, dog, groomer, {
      service: ' full-groom ',
      preferredWindows,
      customerNotes: ' Call before confirming. ',
    });

    expect(client.spies.from).toHaveBeenCalledWith('appointment_requests');
    expect(client.spies.insert).toHaveBeenCalledWith({
      customer_id: customer.id,
      dog_id: dog.id,
      groomer_id: groomer.id,
      service: 'full-groom',
      preferred_windows: preferredWindows,
      customer_notes: 'Call before confirming.',
      status: 'external_handoff',
      external_booking_url: groomer.website,
    });
    expect(request).toMatchObject({
      id: 'request-1',
      customerId: customer.id,
      dogId: dog.id,
      groomerId: groomer.id,
      status: 'external_handoff',
    });
  });

  it('creates a requested request when no external booking URL is known', async () => {
    const client = makeInsertClient({
      id: 'request-1',
      customer_id: customer.id,
      dog_id: dog.id,
      groomer_id: groomer.id,
      service: 'bath-brush',
      preferred_windows: ['first-available'],
      status: 'requested',
      external_booking_url: null,
    });

    await createBookingRequest(client, customer, dog, { ...groomer, website: '' }, {
      service: 'bath-brush',
      preferredWindows: ['first-available'],
    });

    expect(client.spies.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'requested',
        external_booking_url: null,
      }),
    );
  });

  it('rejects requests for dogs outside the verified customer row', async () => {
    const client = makeInsertClient({});

    await expect(
      createBookingRequest(client, customer, { ...dog, customerId: 'other-customer' }, groomer, {
        service: 'full-groom',
        preferredWindows: ['weekday-evening'],
      }),
    ).rejects.toThrow('Choose one of your dog profiles.');
    expect(client.spies.insert).not.toHaveBeenCalled();
  });

  it('builds realistic request timing from preferred dates and time of day', () => {
    expect(
      buildPreferredWindows({
        firstAvailable: true,
        preferredDate: '2026-06-05',
        preferredTimeOfDay: 'morning',
        backupDate: '2026-06-07',
        backupTimeOfDay: 'afternoon',
      }),
    ).toEqual([
      { type: 'first-available' },
      { type: 'preferred-date', date: '2026-06-05', timeOfDay: 'morning' },
      { type: 'backup-date', date: '2026-06-07', timeOfDay: 'afternoon' },
    ]);
    expect(TIME_OF_DAY_OPTIONS.map((option) => option.value)).toEqual([
      'morning',
      'afternoon',
      'evening',
    ]);
  });

  it('rejects invalid request timing before writing', async () => {
    const client = makeInsertClient({});

    await expect(
      createBookingRequest(client, customer, dog, groomer, {
        service: 'full-groom',
        preferredWindows: [
          { type: 'preferred-date', date: '06/05/2026', timeOfDay: 'whenever' },
        ],
      }),
    ).rejects.toThrow('Choose a valid preferred date.');
    expect(client.spies.insert).not.toHaveBeenCalled();
  });
});
