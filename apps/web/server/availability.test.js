// @vitest-environment node

import { vi, describe, it, expect, beforeEach } from 'vitest';

// vi.mock is hoisted before imports by Vitest, so these factories run first.
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

vi.mock('../../api/src/booking/slots.js', () => ({
  generateSlots: vi.fn(),
}));

import { createClient } from '@supabase/supabase-js';
import { generateSlots } from '../../api/src/booking/slots.js';
import { handleAvailabilityRequest, toPublicAvailabilityError } from './availability.js';

// Minimal env that satisfies the server Supabase client factory.
const env = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

// Sample DB rows used across tests.
const WEEKLY_HOURS = [{ day_of_week: 1, open_time: '09:00', close_time: '17:00' }];
const OFFERINGS = [{ service: 'bath', duration_minutes: 60 }];

// Build a chainable Supabase query mock that resolves to `result`.
// Uses a closure (`chain`) to ensure `.select()` returns the same object
// so further chaining like `.eq()` works correctly.
function makeChain(result) {
  const chain = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn().mockResolvedValue(result);
  return chain;
}

// Wire up a fake Supabase client whose `from(table)` returns data keyed by table name.
function makeSupabase(tableData) {
  const client = {
    from: vi.fn((table) =>
      makeChain(tableData[table] ?? { data: [], error: null }),
    ),
  };
  vi.mocked(createClient).mockReturnValue(client);
  return client;
}

describe('handleAvailabilityRequest', () => {
  beforeEach(() => {
    vi.mocked(generateSlots).mockReset();
  });

  it('happy path: returns non-empty slot array when weekly hours and offerings exist', async () => {
    const fakeSlot = {
      start: new Date('2026-06-02T14:00:00Z'),
      end: new Date('2026-06-02T15:00:00Z'),
      iso: '2026-06-02T14:00:00.000Z',
    };
    vi.mocked(generateSlots).mockReturnValue([fakeSlot]);

    makeSupabase({
      groomer_weekly_hours: { data: WEEKLY_HOURS, error: null },
      groomer_offerings: { data: OFFERINGS, error: null },
      groomer_time_off: { data: [], error: null },
      appointments: { data: [], error: null },
    });

    const result = await handleAvailabilityRequest({ groomerId: 'g1' }, env);

    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].iso).toBe('2026-06-02T14:00:00.000Z');
    expect(generateSlots).toHaveBeenCalledOnce();
  });

  it('returns { slots: [] } when the groomer has no weekly_hours rows', async () => {
    makeSupabase({
      groomer_weekly_hours: { data: [], error: null },
      groomer_offerings: { data: [], error: null },
      groomer_time_off: { data: [], error: null },
      appointments: { data: [], error: null },
    });

    const result = await handleAvailabilityRequest({ groomerId: 'unknown-groomer' }, env);

    expect(result).toEqual({ slots: [] });
    // generateSlots should never be called for an unknown groomer.
    expect(generateSlots).not.toHaveBeenCalled();
  });

  it('throws when Supabase returns an error, and toPublicAvailabilityError produces { statusCode: 500, body: { error } }', async () => {
    makeSupabase({
      groomer_weekly_hours: {
        data: null,
        error: { message: 'relation "groomer_weekly_hours" does not exist' },
      },
      groomer_offerings: { data: [], error: null },
      groomer_time_off: { data: [], error: null },
      appointments: { data: [], error: null },
    });

    let thrown;
    try {
      await handleAvailabilityRequest({ groomerId: 'g1' }, env);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(Error);

    const publicError = toPublicAvailabilityError(thrown);
    expect(publicError).toEqual({
      statusCode: 500,
      body: { error: expect.stringContaining('does not exist') },
    });
  });

  it('forwards timezone: America/Los_Angeles to generateSlots', async () => {
    vi.mocked(generateSlots).mockReturnValue([]);

    makeSupabase({
      groomer_weekly_hours: { data: WEEKLY_HOURS, error: null },
      groomer_offerings: { data: OFFERINGS, error: null },
      groomer_time_off: { data: [], error: null },
      appointments: { data: [], error: null },
    });

    await handleAvailabilityRequest(
      { groomerId: 'g1', timezone: 'America/Los_Angeles' },
      env,
    );

    expect(generateSlots).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: 'America/Los_Angeles' }),
      expect.any(Array),
    );
  });
});

describe('toPublicAvailabilityError', () => {
  it('maps any Error to { statusCode: 500, body: { error: string } }', () => {
    const error = new Error('Supabase query timed out');
    expect(toPublicAvailabilityError(error)).toEqual({
      statusCode: 500,
      body: { error: 'Supabase query timed out' },
    });
  });

  it('falls back to a default message when error has no message', () => {
    expect(toPublicAvailabilityError(null)).toEqual({
      statusCode: 500,
      body: { error: 'Availability check failed.' },
    });
  });
});
