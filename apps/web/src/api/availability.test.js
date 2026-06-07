import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchAvailableSlots } from './availability.js';

describe('availability api', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the slots array when fetch returns 200 with slots', async () => {
    const mockSlots = [
      { slotId: 'slot-1', startTime: '2024-01-15T09:00:00Z' },
      { slotId: 'slot-2', startTime: '2024-01-15T10:00:00Z' },
    ];

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ slots: mockSlots }),
    });

    const result = await fetchAvailableSlots({
      groomerId: 'groomer-1',
      serviceId: 'full-groom',
      from: '2024-01-15',
      to: '2024-01-20',
    });

    expect(result).toEqual(mockSlots);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/availability?'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('throws an error with the server message when fetch returns 4xx', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Groomer not found' }),
    });

    await expect(
      fetchAvailableSlots({
        groomerId: 'invalid-groomer',
        serviceId: 'full-groom',
        from: '2024-01-15',
        to: '2024-01-20',
      }),
    ).rejects.toThrow('Groomer not found');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('returns an empty array when fetch returns 200 with empty slots', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ slots: [] }),
    });

    const result = await fetchAvailableSlots({
      groomerId: 'groomer-1',
      serviceId: 'full-groom',
      from: '2024-01-15',
      to: '2024-01-20',
    });

    expect(result).toEqual([]);
  });
});
