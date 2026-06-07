import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  createOwnedGroomer,
  deleteAvailabilityBlock,
  saveAvailabilityBlock,
  saveOffering,
  saveTimeOff,
  setWaitlistOptIn,
} from './groomerOnboarding.js';

/**
 * Helper to create a mock Supabase client for single() operations.
 * Returns both the client and spies for verification.
 */
function makeSingleClient(data = null, error = null) {
  const single = vi.fn().mockResolvedValue({ data, error });
  const select = vi.fn(() => ({ single }));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq, select }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn((table) => ({ insert, update, eq, select }));

  return {
    from,
    spies: { from, insert, update, eq, select, single },
  };
}

/**
 * Helper for rpc() operations.
 */
function makeRpcClient(data = null, error = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });

  return {
    rpc,
    spies: { rpc },
  };
}

/**
 * Helper for delete operations.
 */
function makeDeleteClient(error = null) {
  const eq = vi.fn().mockResolvedValue({ error });
  const deleteOp = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ delete: deleteOp }));

  return {
    from,
    spies: { from, delete: deleteOp, eq },
  };
}

describe('createOwnedGroomer', () => {
  it('calls create_owned_groomer RPC with snake_case params and maps result', async () => {
    const client = makeRpcClient({
      id: 'groomer-1',
      name: 'Jill',
      salon: 'Happy Tails',
      address: '123 Main St',
      phone: '555-1234',
      website: 'https://happytails.com',
      bio_text: 'Expert dog groomer',
      accepts_waitlist: true,
    });

    const result = await createOwnedGroomer(client, {
      groomerId: 'groomer-1',
      bioText: 'Expert dog groomer',
    });

    expect(client.spies.rpc).toHaveBeenCalledWith('create_owned_groomer', {
      groomer_id: 'groomer-1',
      bio_text: 'Expert dog groomer',
    });

    expect(result).toEqual({
      id: 'groomer-1',
      name: 'Jill',
      salon: 'Happy Tails',
      address: '123 Main St',
      phone: '555-1234',
      website: 'https://happytails.com',
      bioText: 'Expert dog groomer',
      acceptsWaitlist: true,
    });
  });

  it('throws when RPC returns an error', async () => {
    const client = makeRpcClient(null, { message: 'rpc failed' });

    await expect(createOwnedGroomer(client, { groomerId: 'g-1' })).rejects.toThrow('rpc failed');
  });

  it('handles missing optional bioText param', async () => {
    const client = makeRpcClient({
      id: 'g-1',
      name: 'Alice',
      bio_text: null,
      accepts_waitlist: false,
    });

    const result = await createOwnedGroomer(client, {
      groomerId: 'g-1',
    });

    expect(client.spies.rpc).toHaveBeenCalledWith('create_owned_groomer', {
      groomer_id: 'g-1',
      bio_text: null,
    });

    expect(result.bioText).toBe('');
    expect(result.acceptsWaitlist).toBe(false);
  });
});

describe('saveOffering', () => {
  it('inserts a new offering with snake_case params and maps result', async () => {
    const client = makeSingleClient({
      id: 'offer-1',
      groomer_id: 'groomer-1',
      service_name: 'Full Groom',
      base_price_cents: 10000,
      duration_minutes: 120,
      description: 'Complete grooming',
    });

    const result = await saveOffering(client, 'groomer-1', {
      serviceName: 'Full Groom',
      basePriceCents: 10000,
      durationMinutes: 120,
      description: 'Complete grooming',
    });

    expect(client.spies.from).toHaveBeenCalledWith('groomer_service_offerings');
    expect(client.spies.insert).toHaveBeenCalledWith({
      groomer_id: 'groomer-1',
      service_name: 'Full Groom',
      base_price_cents: 10000,
      duration_minutes: 120,
      description: 'Complete grooming',
    });

    expect(result).toEqual({
      id: 'offer-1',
      groomerId: 'groomer-1',
      serviceName: 'Full Groom',
      basePriceCents: 10000,
      durationMinutes: 120,
      description: 'Complete grooming',
    });
  });

  it('updates an existing offering when id is provided', async () => {
    const client = makeSingleClient({
      id: 'offer-1',
      groomer_id: 'groomer-1',
      service_name: 'Bath Only',
      base_price_cents: 5000,
      duration_minutes: 45,
      description: null,
    });

    const result = await saveOffering(client, 'groomer-1', {
      id: 'offer-1',
      serviceName: 'Bath Only',
      basePriceCents: 5000,
      durationMinutes: 45,
    });

    expect(client.spies.update).toHaveBeenCalledWith({
      id: 'offer-1',
      groomer_id: 'groomer-1',
      service_name: 'Bath Only',
      base_price_cents: 5000,
      duration_minutes: 45,
      description: null,
    });
    expect(client.spies.eq).toHaveBeenCalledWith('id', 'offer-1');

    expect(result.serviceName).toBe('Bath Only');
    expect(result.description).toBe('');
  });

  it('maps null/undefined optional fields', async () => {
    const client = makeSingleClient({
      id: 'offer-2',
      groomer_id: 'g-1',
      service_name: 'Nail Trim',
      base_price_cents: 2000,
      duration_minutes: null,
      description: null,
    });

    const result = await saveOffering(client, 'g-1', {
      serviceName: 'Nail Trim',
      basePriceCents: 2000,
    });

    expect(result.durationMinutes).toBeNull();
    expect(result.description).toBe('');
  });

  it('throws when insert returns an error', async () => {
    const client = makeSingleClient(null, { message: 'unique constraint' });

    await expect(
      saveOffering(client, 'g-1', {
        serviceName: 'Duplicate',
        basePriceCents: 5000,
      }),
    ).rejects.toThrow('unique constraint');
  });
});

describe('saveAvailabilityBlock', () => {
  it('inserts a new availability block with snake_case params', async () => {
    const client = makeSingleClient({
      id: 'avail-1',
      groomer_id: 'groomer-1',
      day_of_week: 1,
      start_time_hhmm: '09:00',
      end_time_hhmm: '17:00',
    });

    const result = await saveAvailabilityBlock(client, 'groomer-1', {
      dayOfWeek: 1,
      startTimeHHMM: '09:00',
      endTimeHHMM: '17:00',
    });

    expect(client.spies.from).toHaveBeenCalledWith('groomer_availability');
    expect(client.spies.insert).toHaveBeenCalledWith({
      groomer_id: 'groomer-1',
      day_of_week: 1,
      start_time_hhmm: '09:00',
      end_time_hhmm: '17:00',
    });

    expect(result).toEqual({
      id: 'avail-1',
      groomerId: 'groomer-1',
      dayOfWeek: 1,
      startTimeHHMM: '09:00',
      endTimeHHMM: '17:00',
    });
  });

  it('updates an existing availability block when id is provided', async () => {
    const client = makeSingleClient({
      id: 'avail-1',
      groomer_id: 'groomer-1',
      day_of_week: 3,
      start_time_hhmm: '10:00',
      end_time_hhmm: '18:00',
    });

    const result = await saveAvailabilityBlock(client, 'groomer-1', {
      id: 'avail-1',
      dayOfWeek: 3,
      startTimeHHMM: '10:00',
      endTimeHHMM: '18:00',
    });

    expect(client.spies.update).toHaveBeenCalledWith({
      id: 'avail-1',
      groomer_id: 'groomer-1',
      day_of_week: 3,
      start_time_hhmm: '10:00',
      end_time_hhmm: '18:00',
    });
    expect(client.spies.eq).toHaveBeenCalledWith('id', 'avail-1');

    expect(result.dayOfWeek).toBe(3);
  });

  it('throws when insert returns an error', async () => {
    const client = makeSingleClient(null, { message: 'invalid day_of_week' });

    await expect(
      saveAvailabilityBlock(client, 'g-1', {
        dayOfWeek: 7,
        startTimeHHMM: '09:00',
        endTimeHHMM: '17:00',
      }),
    ).rejects.toThrow('invalid day_of_week');
  });
});

describe('deleteAvailabilityBlock', () => {
  it('deletes an availability block by id', async () => {
    const client = makeDeleteClient(null);

    await deleteAvailabilityBlock(client, 'avail-1');

    expect(client.spies.from).toHaveBeenCalledWith('groomer_availability');
    expect(client.spies.delete).toHaveBeenCalled();
    expect(client.spies.eq).toHaveBeenCalledWith('id', 'avail-1');
  });

  it('throws when delete returns an error', async () => {
    const client = makeDeleteClient({ message: 'record not found' });

    await expect(deleteAvailabilityBlock(client, 'avail-999')).rejects.toThrow(
      'record not found',
    );
  });
});

describe('saveTimeOff', () => {
  it('inserts a time-off entry with snake_case params and maps result', async () => {
    const client = makeSingleClient({
      id: 'timeoff-1',
      groomer_id: 'groomer-1',
      start_date: '2026-06-15',
      end_date: '2026-06-20',
      reason: 'Vacation',
    });

    const result = await saveTimeOff(client, 'groomer-1', {
      startDate: '2026-06-15',
      endDate: '2026-06-20',
      reason: 'Vacation',
    });

    expect(client.spies.from).toHaveBeenCalledWith('groomer_time_off');
    expect(client.spies.insert).toHaveBeenCalledWith({
      groomer_id: 'groomer-1',
      start_date: '2026-06-15',
      end_date: '2026-06-20',
      reason: 'Vacation',
    });

    expect(result).toEqual({
      id: 'timeoff-1',
      groomerId: 'groomer-1',
      startDate: '2026-06-15',
      endDate: '2026-06-20',
      reason: 'Vacation',
    });
  });

  it('allows null reason when not provided', async () => {
    const client = makeSingleClient({
      id: 'timeoff-2',
      groomer_id: 'groomer-1',
      start_date: '2026-07-01',
      end_date: '2026-07-02',
      reason: null,
    });

    const result = await saveTimeOff(client, 'groomer-1', {
      startDate: '2026-07-01',
      endDate: '2026-07-02',
    });

    expect(client.spies.insert).toHaveBeenCalledWith({
      groomer_id: 'groomer-1',
      start_date: '2026-07-01',
      end_date: '2026-07-02',
      reason: null,
    });

    expect(result.reason).toBe('');
  });

  it('throws when insert returns an error', async () => {
    const client = makeSingleClient(null, { message: 'invalid date range' });

    await expect(
      saveTimeOff(client, 'g-1', {
        startDate: '2026-07-02',
        endDate: '2026-07-01',
      }),
    ).rejects.toThrow('invalid date range');
  });
});

describe('setWaitlistOptIn', () => {
  it('updates accepts_waitlist to true and maps result', async () => {
    const client = makeSingleClient({
      id: 'groomer-1',
      name: 'Alice',
      salon: 'Grooming Central',
      address: '456 Oak St',
      phone: '555-5678',
      website: 'https://groomingcentral.com',
      bio_text: 'Experienced groomer',
      accepts_waitlist: true,
    });

    const result = await setWaitlistOptIn(client, 'groomer-1', true);

    expect(client.spies.from).toHaveBeenCalledWith('groomers');
    expect(client.spies.update).toHaveBeenCalledWith({ accepts_waitlist: true });
    expect(client.spies.eq).toHaveBeenCalledWith('id', 'groomer-1');

    expect(result).toEqual({
      id: 'groomer-1',
      name: 'Alice',
      salon: 'Grooming Central',
      address: '456 Oak St',
      phone: '555-5678',
      website: 'https://groomingcentral.com',
      bioText: 'Experienced groomer',
      acceptsWaitlist: true,
    });
  });

  it('updates accepts_waitlist to false', async () => {
    const client = makeSingleClient({
      id: 'groomer-2',
      name: 'Bob',
      salon: null,
      address: null,
      phone: null,
      website: null,
      bio_text: null,
      accepts_waitlist: false,
    });

    const result = await setWaitlistOptIn(client, 'groomer-2', false);

    expect(client.spies.update).toHaveBeenCalledWith({ accepts_waitlist: false });
    expect(result.acceptsWaitlist).toBe(false);
  });

  it('throws when update returns an error', async () => {
    const client = makeSingleClient(null, { message: 'groomer not found' });

    await expect(setWaitlistOptIn(client, 'g-999', true)).rejects.toThrow(
      'groomer not found',
    );
  });
});
