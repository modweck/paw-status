import { describe, expect, it, vi } from 'vitest';

import {
  buildPreferredWindows,
  createBookingRequest,
  loadCustomerBookingRequests,
  mapBookingRequestListRow,
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

describe('mapBookingRequestListRow', () => {
  it('attaches the joined groomer and dog from PostgREST as flat objects', () => {
    expect(
      mapBookingRequestListRow({
        id: 'request-2',
        customer_id: customer.id,
        dog_id: dog.id,
        groomer_id: groomer.id,
        service: 'bath-brush',
        preferred_windows: [{ type: 'first-available' }],
        customer_notes: 'No fragrance',
        status: 'requested',
        external_booking_url: '',
        created_at: '2026-05-20T10:00:00.000Z',
        updated_at: '2026-05-20T10:00:00.000Z',
        groomer: { id: 'g-1', name: 'Jill', salon: 'Happy Tails' },
        dog: { id: 'd-1', name: 'Mochi' },
      }),
    ).toEqual({
      id: 'request-2',
      customerId: customer.id,
      dogId: dog.id,
      groomerId: groomer.id,
      service: 'bath-brush',
      preferredWindows: [{ type: 'first-available' }],
      customerNotes: 'No fragrance',
      status: 'requested',
      externalBookingUrl: '',
      createdAt: '2026-05-20T10:00:00.000Z',
      updatedAt: '2026-05-20T10:00:00.000Z',
      groomer: { id: 'g-1', name: 'Jill', salon: 'Happy Tails' },
      dog: { id: 'd-1', name: 'Mochi' },
    });
  });

  it('unwraps single-item arrays returned by Supabase for embedded resources', () => {
    const mapped = mapBookingRequestListRow({
      id: 'request-3',
      customer_id: customer.id,
      dog_id: dog.id,
      groomer_id: groomer.id,
      service: 'bath',
      preferred_windows: [],
      customer_notes: '',
      status: 'requested',
      external_booking_url: '',
      created_at: '',
      updated_at: '',
      groomer: [{ id: 'g-1', name: 'Jill', salon: null }],
      dog: [{ id: 'd-1', name: 'Mochi' }],
    });
    expect(mapped.groomer).toEqual({ id: 'g-1', name: 'Jill', salon: null });
    expect(mapped.dog).toEqual({ id: 'd-1', name: 'Mochi' });
  });

  it('returns null groomer/dog when the joined rows are missing', () => {
    const mapped = mapBookingRequestListRow({
      id: 'request-4',
      customer_id: customer.id,
      dog_id: dog.id,
      groomer_id: groomer.id,
      service: '',
      preferred_windows: [],
      customer_notes: '',
      status: 'requested',
      external_booking_url: '',
      created_at: '',
      updated_at: '',
      groomer: null,
      dog: null,
    });
    expect(mapped.groomer).toBeNull();
    expect(mapped.dog).toBeNull();
  });

  it('coerces null external_booking_url, customer_notes, and service to empty strings', () => {
    const mapped = mapBookingRequestListRow({
      id: 'request-null',
      customer_id: customer.id,
      dog_id: dog.id,
      groomer_id: groomer.id,
      service: null,
      preferred_windows: null,
      customer_notes: null,
      status: 'requested',
      external_booking_url: null,
      created_at: '2026-05-20T10:00:00.000Z',
      updated_at: '2026-05-20T10:00:00.000Z',
      groomer: null,
      dog: null,
    });
    expect(mapped.externalBookingUrl).toBe('');
    expect(mapped.customerNotes).toBe('');
    expect(mapped.service).toBe('');
    expect(mapped.preferredWindows).toEqual([]);
  });

  it('falls back updatedAt to createdAt when updated_at is missing', () => {
    const mapped = mapBookingRequestListRow({
      id: 'request-5',
      customer_id: customer.id,
      dog_id: dog.id,
      groomer_id: groomer.id,
      service: '',
      preferred_windows: [],
      customer_notes: '',
      status: 'requested',
      external_booking_url: '',
      created_at: '2026-05-20T10:00:00.000Z',
      updated_at: null,
    });
    expect(mapped.updatedAt).toBe('2026-05-20T10:00:00.000Z');
  });
});

describe('loadCustomerBookingRequests', () => {
  function makeSelectClient(rows, error = null) {
    const order = vi.fn().mockResolvedValue({ data: rows, error });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    return {
      from,
      spies: { from, select, eq, order },
    };
  }

  it('queries appointment_requests for the customer, newest first, and returns mapped rows', async () => {
    const client = makeSelectClient([
      {
        id: 'request-a',
        customer_id: customer.id,
        dog_id: dog.id,
        groomer_id: groomer.id,
        service: 'bath',
        preferred_windows: [],
        customer_notes: '',
        status: 'requested',
        external_booking_url: '',
        created_at: '2026-05-21',
        updated_at: '2026-05-21',
        groomer: { id: 'g-1', name: 'Jill', salon: 'Happy Tails' },
        dog: { id: 'd-1', name: 'Mochi' },
      },
    ]);

    const rows = await loadCustomerBookingRequests(client, customer);
    expect(client.spies.from).toHaveBeenCalledWith('appointment_requests');
    expect(client.spies.eq).toHaveBeenCalledWith('customer_id', customer.id);
    expect(client.spies.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'request-a', groomer: { name: 'Jill' } });
  });

  it('returns an empty array when there are no requests', async () => {
    const client = makeSelectClient([]);
    await expect(loadCustomerBookingRequests(client, customer)).resolves.toEqual([]);
  });

  it('throws when Supabase returns an error', async () => {
    const client = makeSelectClient(null, { message: 'rls denied' });
    await expect(loadCustomerBookingRequests(client, customer)).rejects.toThrow('rls denied');
  });

  it('requires a customer with an id before issuing the query', async () => {
    const client = makeSelectClient([]);
    await expect(loadCustomerBookingRequests(client, { id: '' })).rejects.toThrow(
      /Customer profile required/i,
    );
    expect(client.spies.from).not.toHaveBeenCalled();
  });
});
