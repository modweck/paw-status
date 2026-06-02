import { describe, expect, it, vi } from 'vitest';

import {
  createTimeOff,
  createWeeklyHours,
  deleteTimeOff,
  deleteWeeklyHours,
  loadTimeOff,
  loadWeeklyHours,
  updateWeeklyHours,
} from './groomerAvailability.js';

function makeListClient(rows) {
  const order = vi.fn().mockResolvedValue({ data: rows, error: null });
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from, spies: { from, select, eq, order } };
}

function makeInsertClient(row) {
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  return { from, spies: { from, insert, select, single } };
}

function makeUpdateClient(row) {
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const select = vi.fn(() => ({ single }));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  return { from, spies: { from, update, eq, select, single } };
}

function makeDeleteClient() {
  const eq = vi.fn().mockResolvedValue({ error: null });
  const del = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ delete: del }));
  return { from, spies: { from, delete: del, eq } };
}

describe('groomerAvailability — weekly hours', () => {
  it('loads weekly hours for a groomer', async () => {
    const client = makeListClient([
      { id: 'wh-1', groomer_id: 'groomer-1', day_of_week: 1, open_time: '09:00', close_time: '17:00' },
    ]);

    const hours = await loadWeeklyHours(client, 'groomer-1');

    expect(client.spies.from).toHaveBeenCalledWith('groomer_weekly_hours');
    expect(hours).toEqual([
      { id: 'wh-1', groomerId: 'groomer-1', dayOfWeek: 1, openTime: '09:00', closeTime: '17:00' },
    ]);
  });

  it('creates a weekly-hours window', async () => {
    const client = makeInsertClient({
      id: 'wh-2',
      groomer_id: 'groomer-1',
      day_of_week: 2,
      open_time: '10:00',
      close_time: '14:00',
    });

    await createWeeklyHours(client, 'groomer-1', { dayOfWeek: 2, openTime: '10:00', closeTime: '14:00' });

    expect(client.spies.insert).toHaveBeenCalledWith({
      groomer_id: 'groomer-1',
      day_of_week: 2,
      open_time: '10:00',
      close_time: '14:00',
    });
  });

  it('rejects an out-of-range day', async () => {
    const client = makeInsertClient({});
    await expect(
      createWeeklyHours(client, 'groomer-1', { dayOfWeek: 9, openTime: '09:00', closeTime: '17:00' }),
    ).rejects.toThrow('day of the week');
    expect(client.spies.insert).not.toHaveBeenCalled();
  });

  it('rejects an open time at or after the close time', async () => {
    const client = makeInsertClient({});
    await expect(
      createWeeklyHours(client, 'groomer-1', { dayOfWeek: 1, openTime: '17:00', closeTime: '09:00' }),
    ).rejects.toThrow('before closing');
  });

  it('rejects a window overlapping an existing one on the same day', async () => {
    const client = makeInsertClient({});
    const existing = [
      { id: 'wh-1', dayOfWeek: 1, openTime: '09:00', closeTime: '12:00' },
    ];
    await expect(
      createWeeklyHours(
        client,
        'groomer-1',
        { dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' },
        { existing },
      ),
    ).rejects.toThrow('overlaps');
    expect(client.spies.insert).not.toHaveBeenCalled();
  });

  it('allows a non-overlapping window on the same day', async () => {
    const client = makeInsertClient({
      id: 'wh-3',
      groomer_id: 'groomer-1',
      day_of_week: 1,
      open_time: '13:00',
      close_time: '17:00',
    });
    const existing = [{ id: 'wh-1', dayOfWeek: 1, openTime: '09:00', closeTime: '12:00' }];
    await createWeeklyHours(
      client,
      'groomer-1',
      { dayOfWeek: 1, openTime: '13:00', closeTime: '17:00' },
      { existing },
    );
    expect(client.spies.insert).toHaveBeenCalled();
  });

  it('excludes the row being updated from its own overlap check', async () => {
    const client = makeUpdateClient({
      id: 'wh-1',
      groomer_id: 'groomer-1',
      day_of_week: 1,
      open_time: '09:30',
      close_time: '12:30',
    });
    const existing = [{ id: 'wh-1', dayOfWeek: 1, openTime: '09:00', closeTime: '12:00' }];
    await updateWeeklyHours(
      client,
      'wh-1',
      { dayOfWeek: 1, openTime: '09:30', closeTime: '12:30' },
      { existing },
    );
    expect(client.spies.update).toHaveBeenCalled();
  });

  it('deletes a weekly-hours window by id', async () => {
    const client = makeDeleteClient();
    await deleteWeeklyHours(client, 'wh-1');
    expect(client.spies.eq).toHaveBeenCalledWith('id', 'wh-1');
  });
});

describe('groomerAvailability — time off', () => {
  it('loads time off for a groomer', async () => {
    const client = makeListClient([
      { id: 'to-1', groomer_id: 'groomer-1', start_at: '2026-07-01T00:00:00Z', end_at: '2026-07-05T00:00:00Z' },
    ]);
    const timeOff = await loadTimeOff(client, 'groomer-1');
    expect(client.spies.from).toHaveBeenCalledWith('groomer_time_off');
    expect(timeOff[0]).toEqual({
      id: 'to-1',
      groomerId: 'groomer-1',
      startAt: '2026-07-01T00:00:00Z',
      endAt: '2026-07-05T00:00:00Z',
    });
  });

  it('creates a time-off block', async () => {
    const client = makeInsertClient({
      id: 'to-2',
      groomer_id: 'groomer-1',
      start_at: '2026-07-01T00:00:00Z',
      end_at: '2026-07-05T00:00:00Z',
    });
    await createTimeOff(client, 'groomer-1', {
      startAt: '2026-07-01T00:00:00Z',
      endAt: '2026-07-05T00:00:00Z',
    });
    expect(client.spies.insert).toHaveBeenCalledWith({
      groomer_id: 'groomer-1',
      start_at: '2026-07-01T00:00:00Z',
      end_at: '2026-07-05T00:00:00Z',
    });
  });

  it('rejects a time-off block whose start is not before its end', async () => {
    const client = makeInsertClient({});
    await expect(
      createTimeOff(client, 'groomer-1', {
        startAt: '2026-07-05T00:00:00Z',
        endAt: '2026-07-01T00:00:00Z',
      }),
    ).rejects.toThrow('start must be before the end');
    expect(client.spies.insert).not.toHaveBeenCalled();
  });

  it('deletes a time-off block by id', async () => {
    const client = makeDeleteClient();
    await deleteTimeOff(client, 'to-1');
    expect(client.spies.eq).toHaveBeenCalledWith('id', 'to-1');
  });
});
