// @vitest-environment node

import { vi, describe, it, expect, beforeEach } from 'vitest';

// vi.mock is hoisted before imports by Vitest, so these factories run first.
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

vi.mock('../../api/src/booking/slots.js', () => ({
  generateSlots: vi.fn(),
}));

import { generateSlots } from '../../api/src/booking/slots.js';
import { computeNextAvailable } from './nextAvailable.js';

// Sample data for testing
const GROOMER_1 = {
  groomer_id: 'g1-uuid',
  name: 'Alice Groomer',
  salon: 'Paw Palace',
  address: '123 Main St',
  phone: '555-1234',
  service: 'bath',
  duration_minutes: 60,
  distance_meters: 100,
};

const GROOMER_2 = {
  groomer_id: 'g2-uuid',
  name: 'Bob Groomer',
  salon: 'Happy Tails',
  address: '456 Oak Ave',
  phone: '555-5678',
  service: 'bath',
  duration_minutes: 60,
  distance_meters: 500,
};

const WEEKLY_HOURS = [{ day_of_week: 1, open_time: '09:00', close_time: '17:00' }];
const OFFERINGS = [{ service: 'bath', duration_minutes: 60 }];

// Build a chainable Supabase query mock
function makeChain(result) {
  const chain = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn().mockResolvedValue(result);
  return chain;
}

// Build an RPC-like mock
function makeMockRpc(rpcResult) {
  return {
    rpc: vi.fn().mockResolvedValue(rpcResult),
  };
}

// Wire up a complete Supabase client mock
function makeMockSupabase(rpcData, tableData = {}) {
  const rpcMock = makeMockRpc(rpcData);

  return {
    ...rpcMock,
    from: vi.fn((table) =>
      makeChain(tableData[table] ?? { data: [], error: null }),
    ),
  };
}

describe('computeNextAvailable', () => {
  beforeEach(() => {
    vi.mocked(generateSlots).mockReset();
    // Set default behavior for generateSlots
    vi.mocked(generateSlots).mockReturnValue([]);
  });

  it('returns sorted slots from two groomers', async () => {
    const slot1 = {
      start: new Date('2026-06-08T10:00:00Z'),
      end: new Date('2026-06-08T11:00:00Z'),
      iso: '2026-06-08T10:00:00.000Z',
    };

    const slot2 = {
      start: new Date('2026-06-08T09:00:00Z'),
      end: new Date('2026-06-08T10:00:00Z'),
      iso: '2026-06-08T09:00:00.000Z',
    };

    const slot3 = {
      start: new Date('2026-06-08T11:00:00Z'),
      end: new Date('2026-06-08T12:00:00Z'),
      iso: '2026-06-08T11:00:00.000Z',
    };

    vi.mocked(generateSlots)
      .mockReturnValueOnce([slot1]) // Groomer 1
      .mockReturnValueOnce([slot2, slot3]); // Groomer 2

    const supabase = makeMockSupabase(
      { data: [GROOMER_1, GROOMER_2], error: null },
      {
        groomer_weekly_hours: { data: WEEKLY_HOURS, error: null },
        groomer_offerings: { data: OFFERINGS, error: null },
        appointments: { data: [], error: null },
      },
    );

    const result = await computeNextAvailable({
      supabase,
      lat: 40.7128,
      lng: -74.006,
      radiusM: 5000,
      serviceId: 'bath',
      topN: 10,
    });

    expect(result).toHaveLength(3);
    expect(result[0].slotAt.getTime()).toBe(slot2.start.getTime());
    expect(result[0].groomer_name).toBe('Bob Groomer');
    expect(result[1].slotAt.getTime()).toBe(slot1.start.getTime());
    expect(result[1].groomer_name).toBe('Alice Groomer');
    expect(result[2].slotAt.getTime()).toBe(slot3.start.getTime());
  });

  it('returns empty array when RPC returns no groomers', async () => {
    const supabase = makeMockSupabase({ data: [], error: null });

    const result = await computeNextAvailable({
      supabase,
      lat: 40.7128,
      lng: -74.006,
      radiusM: 5000,
      serviceId: 'bath',
    });

    expect(result).toEqual([]);
  });

  it('returns empty array when single groomer has no slots', async () => {
    vi.mocked(generateSlots).mockReturnValue([]);

    const supabase = makeMockSupabase(
      { data: [GROOMER_1], error: null },
      {
        groomer_weekly_hours: { data: WEEKLY_HOURS, error: null },
        groomer_offerings: { data: OFFERINGS, error: null },
        appointments: { data: [], error: null },
      },
    );

    const result = await computeNextAvailable({
      supabase,
      lat: 40.7128,
      lng: -74.006,
      radiusM: 5000,
      serviceId: 'bath',
    });

    expect(result).toEqual([]);
  });

  it('throws when RPC fails', async () => {
    const supabase = makeMockSupabase({
      data: null,
      error: { message: 'Permission denied' },
    });

    let thrown;
    try {
      await computeNextAvailable({
        supabase,
        lat: 40.7128,
        lng: -74.006,
        radiusM: 5000,
        serviceId: 'bath',
      });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown.message).toContain('Failed to fetch groomers');
  });

  it('skips groomer with no weekly_hours and continues with others', async () => {
    const slot = {
      start: new Date('2026-06-08T09:00:00Z'),
      end: new Date('2026-06-08T10:00:00Z'),
      iso: '2026-06-08T09:00:00.000Z',
    };

    vi.mocked(generateSlots).mockReturnValue([slot]);

    // Create a custom Supabase mock that returns different data based on groomer_id
    const rpcMock = makeMockRpc({ data: [GROOMER_1, GROOMER_2], error: null });

    const supabase = {
      ...rpcMock,
      from: vi.fn((table) => {
        const chain = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn((column, value) => {
          if (table === 'groomer_weekly_hours') {
            if (value === GROOMER_1.groomer_id) {
              return Promise.resolve({ data: [], error: null }); // No hours for groomer 1
            }
            if (value === GROOMER_2.groomer_id) {
              return Promise.resolve({ data: WEEKLY_HOURS, error: null }); // Hours for groomer 2
            }
          } else if (table === 'groomer_offerings') {
            return Promise.resolve({ data: OFFERINGS, error: null });
          } else if (table === 'appointments') {
            return Promise.resolve({ data: [], error: null });
          }
          return Promise.resolve({ data: [], error: null });
        });
        return chain;
      }),
    };

    const result = await computeNextAvailable({
      supabase,
      lat: 40.7128,
      lng: -74.006,
      radiusM: 5000,
      serviceId: 'bath',
    });

    // Should skip GROOMER_1 and return slot from GROOMER_2
    expect(result).toHaveLength(1);
    expect(result[0].groomer_id).toBe(GROOMER_2.groomer_id);
  });

  it('respects topN parameter', async () => {
    const slots = Array.from({ length: 5 }, (_, i) => ({
      start: new Date(`2026-06-08T${String(9 + i).padStart(2, '0')}:00:00Z`),
      end: new Date(`2026-06-08T${String(10 + i).padStart(2, '0')}:00:00Z`),
      iso: `2026-06-08T${String(9 + i).padStart(2, '0')}:00:00.000Z`,
    }));

    vi.mocked(generateSlots).mockReturnValue(slots);

    const supabase = makeMockSupabase(
      { data: [GROOMER_1], error: null },
      {
        groomer_weekly_hours: { data: WEEKLY_HOURS, error: null },
        groomer_offerings: { data: OFFERINGS, error: null },
        appointments: { data: [], error: null },
      },
    );

    const result = await computeNextAvailable({
      supabase,
      lat: 40.7128,
      lng: -74.006,
      radiusM: 5000,
      serviceId: 'bath',
      topN: 3,
    });

    expect(result).toHaveLength(3);
  });

  it('includes groomer metadata in results', async () => {
    const slot = {
      start: new Date('2026-06-08T09:00:00Z'),
      end: new Date('2026-06-08T10:00:00Z'),
      iso: '2026-06-08T09:00:00.000Z',
    };

    vi.mocked(generateSlots).mockReturnValue([slot]);

    const supabase = makeMockSupabase(
      { data: [GROOMER_1], error: null },
      {
        groomer_weekly_hours: { data: WEEKLY_HOURS, error: null },
        groomer_offerings: { data: OFFERINGS, error: null },
        appointments: { data: [], error: null },
      },
    );

    const result = await computeNextAvailable({
      supabase,
      lat: 40.7128,
      lng: -74.006,
      radiusM: 5000,
      serviceId: 'bath',
    });

    expect(result[0]).toEqual({
      slotAt: slot.start,
      iso: slot.iso,
      groomer_id: GROOMER_1.groomer_id,
      groomer_name: GROOMER_1.name,
    });
  });
});
