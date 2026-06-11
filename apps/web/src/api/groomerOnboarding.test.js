import { describe, expect, it, vi } from 'vitest';

import {
  createOwnedGroomer,
  deleteAvailabilityBlock,
  refreshGroomerServices,
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
  const from = vi.fn(() => ({ insert, update, eq, select }));

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
  // The create_owned_groomer RPC takes p_* params and returns the new
  // groomer's uuid, not a row. See
  // supabase/migrations/20260607000001_add_groomer_onboarding_rpcs.sql.
  it('calls create_owned_groomer with the p_* RPC params and returns the new id', async () => {
    const client = makeRpcClient('groomer-uuid-1');

    const result = await createOwnedGroomer(client, {
      name: 'Jill',
      salon: 'Happy Tails',
      address: '123 Main St, New York, NY',
      lat: 40.768,
      lng: -73.958,
      phone: '555-1234',
      website: 'https://happytails.example',
    });

    expect(client.spies.rpc).toHaveBeenCalledWith('create_owned_groomer', {
      p_name: 'Jill',
      p_salon: 'Happy Tails',
      p_address: '123 Main St, New York, NY',
      p_lat: 40.768,
      p_lng: -73.958,
      p_phone: '555-1234',
      p_website: 'https://happytails.example',
    });
    expect(result).toEqual({ id: 'groomer-uuid-1' });
  });

  it('passes nulls for missing optional fields', async () => {
    const client = makeRpcClient('groomer-uuid-2');

    await createOwnedGroomer(client, {
      name: 'Alice',
      salon: 'Alice Grooming',
    });

    expect(client.spies.rpc).toHaveBeenCalledWith('create_owned_groomer', {
      p_name: 'Alice',
      p_salon: 'Alice Grooming',
      p_address: null,
      p_lat: null,
      p_lng: null,
      p_phone: null,
      p_website: null,
    });
  });

  it('throws before calling the RPC when name or salon is missing', async () => {
    const client = makeRpcClient('unused');

    await expect(createOwnedGroomer(client, { salon: 'No Name' })).rejects.toThrow(
      /business name/i,
    );
    await expect(createOwnedGroomer(client, { name: 'No Salon' })).rejects.toThrow(/salon/i);
    expect(client.spies.rpc).not.toHaveBeenCalled();
  });

  it('throws when the RPC returns an error', async () => {
    const client = makeRpcClient(null, { message: 'rpc failed' });

    await expect(
      createOwnedGroomer(client, { name: 'Jill', salon: 'Happy Tails' }),
    ).rejects.toThrow('rpc failed');
  });
});

describe('refreshGroomerServices', () => {
  it('calls refresh_groomer_services with the groomer id', async () => {
    const client = makeRpcClient(null);

    await refreshGroomerServices(client, 'groomer-1');

    expect(client.spies.rpc).toHaveBeenCalledWith('refresh_groomer_services', {
      p_groomer_id: 'groomer-1',
    });
  });

  it('throws when the RPC returns an error', async () => {
    const client = makeRpcClient(null, { message: 'refresh failed' });

    await expect(refreshGroomerServices(client, 'groomer-1')).rejects.toThrow('refresh failed');
  });
});

describe('saveOffering', () => {
  // groomer_service_offerings columns are service / duration_minutes /
  // base_price_cents (see 20260529000002 + the 20260529000004 rename).
  it('inserts a new offering against the real column names and maps the row', async () => {
    const client = makeSingleClient({
      id: 'offering-1',
      groomer_id: 'groomer-1',
      service: 'Full groom',
      duration_minutes: 90,
      base_price_cents: 8500,
    });

    const result = await saveOffering(client, 'groomer-1', {
      service: 'Full groom',
      durationMinutes: 90,
      basePriceCents: 8500,
    });

    expect(client.spies.from).toHaveBeenCalledWith('groomer_service_offerings');
    expect(client.spies.insert).toHaveBeenCalledWith({
      groomer_id: 'groomer-1',
      service: 'Full groom',
      duration_minutes: 90,
      base_price_cents: 8500,
    });
    expect(result).toEqual({
      id: 'offering-1',
      groomerId: 'groomer-1',
      service: 'Full groom',
      durationMinutes: 90,
      basePriceCents: 8500,
    });
  });

  it('updates an existing offering by id', async () => {
    const client = makeSingleClient({
      id: 'offering-1',
      groomer_id: 'groomer-1',
      service: 'Bath and brush',
      duration_minutes: 45,
      base_price_cents: 4500,
    });

    await saveOffering(client, 'groomer-1', {
      id: 'offering-1',
      service: 'Bath and brush',
      durationMinutes: 45,
      basePriceCents: 4500,
    });

    expect(client.spies.update).toHaveBeenCalledWith({
      groomer_id: 'groomer-1',
      service: 'Bath and brush',
      duration_minutes: 45,
      base_price_cents: 4500,
    });
    expect(client.spies.eq).toHaveBeenCalledWith('id', 'offering-1');
  });

  it('throws when the insert fails', async () => {
    const client = makeSingleClient(null, { message: 'insert failed' });

    await expect(
      saveOffering(client, 'groomer-1', {
        service: 'Full groom',
        durationMinutes: 90,
        basePriceCents: 8500,
      }),
    ).rejects.toThrow('insert failed');
  });
});

describe('saveAvailabilityBlock', () => {
  // groomer_availability columns are day_of_week / open_time / close_time
  // (renamed from groomer_weekly_hours in 20260529000004).
  it('inserts a block against the real column names and maps the row', async () => {
    const client = makeSingleClient({
      id: 'block-1',
      groomer_id: 'groomer-1',
      day_of_week: 2,
      open_time: '09:00:00',
      close_time: '17:00:00',
    });

    const result = await saveAvailabilityBlock(client, 'groomer-1', {
      dayOfWeek: 2,
      openTime: '09:00',
      closeTime: '17:00',
    });

    expect(client.spies.from).toHaveBeenCalledWith('groomer_availability');
    expect(client.spies.insert).toHaveBeenCalledWith({
      groomer_id: 'groomer-1',
      day_of_week: 2,
      open_time: '09:00',
      close_time: '17:00',
    });
    expect(result).toEqual({
      id: 'block-1',
      groomerId: 'groomer-1',
      dayOfWeek: 2,
      openTime: '09:00:00',
      closeTime: '17:00:00',
    });
  });

  it('updates an existing block by id', async () => {
    const client = makeSingleClient({
      id: 'block-1',
      groomer_id: 'groomer-1',
      day_of_week: 2,
      open_time: '10:00:00',
      close_time: '18:00:00',
    });

    await saveAvailabilityBlock(client, 'groomer-1', {
      id: 'block-1',
      dayOfWeek: 2,
      openTime: '10:00',
      closeTime: '18:00',
    });

    expect(client.spies.update).toHaveBeenCalledWith({
      groomer_id: 'groomer-1',
      day_of_week: 2,
      open_time: '10:00',
      close_time: '18:00',
    });
    expect(client.spies.eq).toHaveBeenCalledWith('id', 'block-1');
  });

  it('throws when the insert fails', async () => {
    const client = makeSingleClient(null, { message: 'availability failed' });

    await expect(
      saveAvailabilityBlock(client, 'groomer-1', {
        dayOfWeek: 1,
        openTime: '09:00',
        closeTime: '17:00',
      }),
    ).rejects.toThrow('availability failed');
  });
});

describe('deleteAvailabilityBlock', () => {
  it('deletes the block by id', async () => {
    const client = makeDeleteClient();

    await deleteAvailabilityBlock(client, 'block-1');

    expect(client.spies.from).toHaveBeenCalledWith('groomer_availability');
    expect(client.spies.eq).toHaveBeenCalledWith('id', 'block-1');
  });

  it('throws when the delete fails', async () => {
    const client = makeDeleteClient({ message: 'delete failed' });

    await expect(deleteAvailabilityBlock(client, 'block-1')).rejects.toThrow('delete failed');
  });
});

describe('saveTimeOff', () => {
  // groomer_time_off columns are start_at / end_at timestamptz.
  it('inserts a time-off entry against the real column names', async () => {
    const client = makeSingleClient({
      id: 'timeoff-1',
      groomer_id: 'groomer-1',
      start_at: '2026-07-01T00:00:00Z',
      end_at: '2026-07-08T00:00:00Z',
    });

    const result = await saveTimeOff(client, 'groomer-1', {
      startAt: '2026-07-01T00:00:00Z',
      endAt: '2026-07-08T00:00:00Z',
    });

    expect(client.spies.from).toHaveBeenCalledWith('groomer_time_off');
    expect(client.spies.insert).toHaveBeenCalledWith({
      groomer_id: 'groomer-1',
      start_at: '2026-07-01T00:00:00Z',
      end_at: '2026-07-08T00:00:00Z',
    });
    expect(result).toEqual({
      id: 'timeoff-1',
      groomerId: 'groomer-1',
      startAt: '2026-07-01T00:00:00Z',
      endAt: '2026-07-08T00:00:00Z',
    });
  });

  it('throws when the insert fails', async () => {
    const client = makeSingleClient(null, { message: 'time off failed' });

    await expect(
      saveTimeOff(client, 'groomer-1', {
        startAt: '2026-07-01T00:00:00Z',
        endAt: '2026-07-08T00:00:00Z',
      }),
    ).rejects.toThrow('time off failed');
  });
});

describe('setWaitlistOptIn', () => {
  it('updates groomers.accepts_waitlist for the groomer', async () => {
    const client = makeSingleClient({
      id: 'groomer-1',
      accepts_waitlist: true,
    });

    const result = await setWaitlistOptIn(client, 'groomer-1', true);

    expect(client.spies.from).toHaveBeenCalledWith('groomers');
    expect(client.spies.update).toHaveBeenCalledWith({ accepts_waitlist: true });
    expect(client.spies.eq).toHaveBeenCalledWith('id', 'groomer-1');
    expect(result.acceptsWaitlist).toBe(true);
  });

  it('throws when the update fails', async () => {
    const client = makeSingleClient(null, { message: 'update failed' });

    await expect(setWaitlistOptIn(client, 'groomer-1', false)).rejects.toThrow('update failed');
  });
});
