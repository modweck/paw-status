import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  claimOffer,
  fetchNextAvailable,
  joinWaitlist,
  loadGroomerWaitlist,
  loadMyOffers,
  loadMyWaitlist,
  offerSlot,
} from './waitlist.js';

const customerId = 'customer-1';
const groomerId = 'groomer-1';
const entryId = 'entry-1';
const offerId = 'offer-1';
const appointmentId = 'appointment-1';
const serviceId = 'full-groom';

function makeWaitlistSelectClient(rows) {
  const order = vi.fn().mockResolvedValue({ data: rows, error: null });
  const select = vi.fn(() => ({ order }));
  const from = vi.fn(() => ({ select }));

  return {
    from,
    spies: { from, select, order },
  };
}

function makeWaitlistInsertClient(row) {
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));

  return {
    from,
    spies: { from, insert, select, single },
  };
}

function makeWaitlistOffersSelectClient(rows) {
  const order = vi.fn().mockResolvedValue({ data: rows, error: null });
  const in_ = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ in: in_ }));
  const from = vi.fn(() => ({ select }));

  return {
    from,
    spies: { from, select, in: in_, order },
  };
}

describe('waitlist api', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchNextAvailable', () => {
    it('posts next-available request to the API endpoint', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              slotAt: '2026-06-15T10:00:00Z',
              iso: '2026-06-15T10:00:00Z',
              groomerId: 'groomer-1',
              groomerName: 'Paw House',
            },
          ]),
      });

      const result = await fetchNextAvailable({
        lat: 40.7128,
        lng: -74.006,
        radiusM: 5000,
        serviceId: 'full-groom',
        topN: 10,
      });

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            slotAt: '2026-06-15T10:00:00Z',
            groomerId: 'groomer-1',
          }),
        ]),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/next-available',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"lat":40.7128'),
        }),
      );
    });

    it('throws on API error response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Location not found' }),
      });

      await expect(
        fetchNextAvailable({
          lat: 40.7128,
          lng: -74.006,
          radiusM: 5000,
          serviceId: 'full-groom',
        }),
      ).rejects.toThrow('Location not found');
    });

    it('throws on non-ok response without error details', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({}),
      });

      await expect(
        fetchNextAvailable({
          lat: 40.7128,
          lng: -74.006,
          radiusM: 5000,
          serviceId: 'full-groom',
        }),
      ).rejects.toThrow('Request failed.');
    });
  });

  describe('joinWaitlist', () => {
    it('creates a groomer-specific waitlist entry', async () => {
      const client = makeWaitlistInsertClient({
        id: entryId,
        customer_id: customerId,
        groomer_id: groomerId,
        service_id: serviceId,
        status: 'active',
        location: null,
        radius_m: null,
        created_at: '2026-06-07T12:00:00Z',
      });

      const entry = await joinWaitlist(client, {
        customerId,
        groomerId,
        serviceId,
      });

      expect(client.spies.insert).toHaveBeenCalledWith({
        customer_id: customerId,
        groomer_id: groomerId,
        service_id: serviceId,
        location: null,
        radius_m: null,
        status: 'active',
      });
      expect(entry).toMatchObject({
        id: entryId,
        customerId,
        groomerId,
        serviceId,
        status: 'active',
      });
    });

    it('creates a geo-based waitlist entry with location and radius', async () => {
      const client = makeWaitlistInsertClient({
        id: entryId,
        customer_id: customerId,
        groomer_id: null,
        service_id: serviceId,
        status: 'active',
        location: { type: 'Point', coordinates: [-74.006, 40.7128] },
        radius_m: 5000,
        created_at: '2026-06-07T12:00:00Z',
      });

      const location = { type: 'Point', coordinates: [-74.006, 40.7128] };

      const entry = await joinWaitlist(client, {
        customerId,
        serviceId,
        location,
        radiusM: 5000,
      });

      expect(client.spies.insert).toHaveBeenCalledWith({
        customer_id: customerId,
        groomer_id: null,
        service_id: serviceId,
        location,
        radius_m: 5000,
        status: 'active',
      });
      expect(entry).toMatchObject({
        customerId,
        serviceId,
        radiusM: 5000,
      });
    });

    it('throws on database error', async () => {
      const client = makeWaitlistInsertClient({});
      client.spies.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Unique constraint failed' },
      });

      await expect(
        joinWaitlist(client, {
          customerId,
          groomerId,
          serviceId,
        }),
      ).rejects.toThrow('Unique constraint failed');
    });
  });

  describe('loadMyWaitlist', () => {
    it('loads customer waitlist entries ordered by creation date descending', async () => {
      const client = makeWaitlistSelectClient([
        {
          id: entryId,
          customer_id: customerId,
          groomer_id: groomerId,
          service_id: serviceId,
          status: 'active',
          location: null,
          radius_m: null,
          created_at: '2026-06-07T12:00:00Z',
        },
      ]);

      const entries = await loadMyWaitlist(client);

      expect(client.spies.from).toHaveBeenCalledWith('waitlist_entries');
      expect(client.spies.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(entries).toEqual([
        expect.objectContaining({
          id: entryId,
          customerId,
          groomerId,
        }),
      ]);
    });

    it('returns empty array when customer has no entries', async () => {
      const client = makeWaitlistSelectClient([]);

      const entries = await loadMyWaitlist(client);

      expect(entries).toEqual([]);
    });

    it('throws on database error', async () => {
      const order = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });
      const select = vi.fn(() => ({ order }));
      const from = vi.fn(() => ({ select }));
      const client = { from };

      await expect(loadMyWaitlist(client)).rejects.toThrow('Database error');
    });
  });

  describe('loadMyOffers', () => {
    it('loads pending and claimed offers for customer entries', async () => {
      const client = makeWaitlistOffersSelectClient([
        {
          id: offerId,
          entry_id: entryId,
          groomer_id: groomerId,
          service_id: serviceId,
          slot_at: '2026-06-15T10:00:00Z',
          duration_minutes: 60,
          status: 'pending',
          expires_at: '2026-06-07T13:00:00Z',
          created_at: '2026-06-07T12:00:00Z',
        },
      ]);

      const offers = await loadMyOffers(client);

      expect(client.spies.from).toHaveBeenCalledWith('waitlist_offers');
      expect(client.spies.in).toHaveBeenCalledWith('status', ['pending', 'claimed']);
      expect(client.spies.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(offers).toEqual([
        expect.objectContaining({
          id: offerId,
          entryId,
          groomerId,
          status: 'pending',
        }),
      ]);
    });

    it('returns empty array when customer has no offers', async () => {
      const client = makeWaitlistOffersSelectClient([]);

      const offers = await loadMyOffers(client);

      expect(offers).toEqual([]);
    });

    it('throws on database error', async () => {
      const client = makeWaitlistOffersSelectClient([]);
      client.spies.order.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      });

      await expect(loadMyOffers(client)).rejects.toThrow('Database error');
    });
  });

  describe('claimOffer', () => {
    it('claims an offer by calling claim_waitlist_offer RPC', async () => {
      const client = {
        rpc: vi.fn().mockResolvedValue({
          data: appointmentId,
          error: null,
        }),
      };

      const result = await claimOffer(client, offerId);

      expect(client.rpc).toHaveBeenCalledWith('claim_waitlist_offer', {
        p_offer_id: offerId,
      });
      expect(result).toBe(appointmentId);
    });

    it('throws when offer not found', async () => {
      const client = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Offer not found' },
        }),
      };

      await expect(claimOffer(client, offerId)).rejects.toThrow('Offer not found');
    });

    it('throws when offer is expired', async () => {
      const client = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Offer has expired' },
        }),
      };

      await expect(claimOffer(client, offerId)).rejects.toThrow('Offer has expired');
    });

    it('throws when caller is not offer owner', async () => {
      const client = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Not authorized to claim this offer' },
        }),
      };

      await expect(claimOffer(client, offerId)).rejects.toThrow(
        'Not authorized to claim this offer',
      );
    });
  });

  describe('loadGroomerWaitlist', () => {
    it('loads active waitlist entries targeting a groomer with customer and service details', async () => {
      const rows = [
        {
          id: entryId,
          customer_id: customerId,
          groomer_id: groomerId,
          service_id: serviceId,
          status: 'active',
          location: null,
          radius_m: null,
          created_at: '2026-06-07T10:00:00Z',
          customers: {
            id: customerId,
            name: 'John Doe',
            email: 'john@example.com',
            phone: '+12125551111',
          },
          groomer_service_offerings: {
            id: serviceId,
            service_name: 'Full Grooming',
          },
        },
        {
          id: 'entry-2',
          customer_id: 'customer-2',
          groomer_id: groomerId,
          service_id: serviceId,
          status: 'active',
          location: null,
          radius_m: null,
          created_at: '2026-06-07T12:00:00Z',
          customers: {
            id: 'customer-2',
            name: 'Jane Smith',
            email: 'jane@example.com',
            phone: '+12125552222',
          },
          groomer_service_offerings: {
            id: serviceId,
            service_name: 'Full Grooming',
          },
        },
      ];
      const order = vi.fn().mockResolvedValue({ data: rows, error: null });
      const eq2 = vi.fn(() => ({ order }));
      const eq1 = vi.fn(() => ({ eq: eq2 }));
      const select = vi.fn(() => ({ eq: eq1 }));
      const from = vi.fn(() => ({ select }));
      const client = { from };

      const entries = await loadGroomerWaitlist(client, groomerId);

      expect(from).toHaveBeenCalledWith('waitlist_entries');
      expect(eq1).toHaveBeenCalledWith('groomer_id', groomerId);
      expect(eq2).toHaveBeenCalledWith('status', 'active');
      expect(order).toHaveBeenCalledWith('created_at', { ascending: true });
      expect(entries).toHaveLength(2);
      expect(entries[0]).toMatchObject({ id: entryId });
      expect(entries[0].customer).toEqual({ name: 'John Doe' });
      expect(entries[0].service).toEqual({ name: 'Full Grooming' });
    });

    it('returns empty array when no entries for groomer', async () => {
      const order = vi.fn().mockResolvedValue({ data: [], error: null });
      const eq2 = vi.fn(() => ({ order }));
      const eq1 = vi.fn(() => ({ eq: eq2 }));
      const select = vi.fn(() => ({ eq: eq1 }));
      const from = vi.fn(() => ({ select }));
      const client = { from };

      const entries = await loadGroomerWaitlist(client, groomerId);

      expect(entries).toEqual([]);
    });

    it('throws on database error', async () => {
      const order = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });
      const eq2 = vi.fn(() => ({ order }));
      const eq1 = vi.fn(() => ({ eq: eq2 }));
      const select = vi.fn(() => ({ eq: eq1 }));
      const from = vi.fn(() => ({ select }));
      const client = { from };

      await expect(loadGroomerWaitlist(client, groomerId)).rejects.toThrow('Database error');
    });
  });

  describe('offerSlot', () => {
    it('offers a slot to next waiting customer via RPC', async () => {
      const slotAt = '2026-06-15T10:00:00Z';
      const client = {
        rpc: vi.fn().mockResolvedValue({
          data: offerId,
          error: null,
        }),
      };

      const result = await offerSlot(client, groomerId, slotAt, serviceId);

      expect(client.rpc).toHaveBeenCalledWith('offer_waitlist_slot', {
        p_groomer_id: groomerId,
        p_slot_at: slotAt,
        p_service_id: serviceId,
      });
      expect(result).toBe(offerId);
    });

    it('returns null when no eligible entries', async () => {
      const slotAt = '2026-06-15T10:00:00Z';
      const client = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };

      const result = await offerSlot(client, groomerId, slotAt, serviceId);

      expect(result).toBeNull();
    });

    it('throws when caller not authorized groomer', async () => {
      const slotAt = '2026-06-15T10:00:00Z';
      const client = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Not authorized to offer slots for this groomer' },
        }),
      };

      await expect(offerSlot(client, groomerId, slotAt, serviceId)).rejects.toThrow(
        'Not authorized to offer slots for this groomer',
      );
    });

    it('throws when service offering not found', async () => {
      const slotAt = '2026-06-15T10:00:00Z';
      const client = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Service offering not found for this groomer' },
        }),
      };

      await expect(offerSlot(client, groomerId, slotAt, serviceId)).rejects.toThrow(
        'Service offering not found for this groomer',
      );
    });
  });
});
