import { describe, expect, it, vi } from 'vitest';

import { loadGroomerProfile, updateGroomerBusinessDetails } from './groomerProfile.js';

function makeSelectClient(row) {
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from, spies: { from, select, eq, single } };
}

function makeUpdateClient(row) {
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const select = vi.fn(() => ({ single }));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  return { from, spies: { from, update, eq, select, single } };
}

const profileRow = {
  id: 'groomer-1',
  name: 'Paw House',
  salon: 'Paw House Grooming',
  phone: '+12125551212',
  website: 'https://pawhouse.example',
  timezone: 'America/New_York',
  lead_time_hours: 12,
};

describe('groomerProfile api', () => {
  it('loads and maps a groomer business profile', async () => {
    const client = makeSelectClient(profileRow);

    const profile = await loadGroomerProfile(client, 'groomer-1');

    expect(client.spies.from).toHaveBeenCalledWith('groomers');
    expect(client.spies.eq).toHaveBeenCalledWith('id', 'groomer-1');
    expect(profile).toEqual({
      id: 'groomer-1',
      name: 'Paw House',
      salon: 'Paw House Grooming',
      phone: '+12125551212',
      website: 'https://pawhouse.example',
      timezone: 'America/New_York',
      leadTimeHours: 12,
    });
  });

  it('updates only the provided business fields', async () => {
    const client = makeUpdateClient({ ...profileRow, name: 'Paw Palace', lead_time_hours: 24 });

    const result = await updateGroomerBusinessDetails(client, 'groomer-1', {
      name: '  Paw Palace  ',
      leadTimeHours: 24,
    });

    expect(client.spies.update).toHaveBeenCalledWith({ name: 'Paw Palace', lead_time_hours: 24 });
    expect(client.spies.eq).toHaveBeenCalledWith('id', 'groomer-1');
    expect(result.name).toBe('Paw Palace');
    expect(result.leadTimeHours).toBe(24);
  });

  it('rejects an empty business name', async () => {
    const client = makeUpdateClient(profileRow);
    await expect(
      updateGroomerBusinessDetails(client, 'groomer-1', { name: '   ' }),
    ).rejects.toThrow('Business name is required.');
    expect(client.spies.update).not.toHaveBeenCalled();
  });

  it('rejects an invalid timezone', async () => {
    const client = makeUpdateClient(profileRow);
    await expect(
      updateGroomerBusinessDetails(client, 'groomer-1', { timezone: 'Banana/Republic' }),
    ).rejects.toThrow('valid timezone');
    expect(client.spies.update).not.toHaveBeenCalled();
  });

  it('rejects an invalid website', async () => {
    const client = makeUpdateClient(profileRow);
    await expect(
      updateGroomerBusinessDetails(client, 'groomer-1', { website: 'not a url' }),
    ).rejects.toThrow('valid website');
    expect(client.spies.update).not.toHaveBeenCalled();
  });

  it('rejects a negative lead time', async () => {
    const client = makeUpdateClient(profileRow);
    await expect(
      updateGroomerBusinessDetails(client, 'groomer-1', { leadTimeHours: -3 }),
    ).rejects.toThrow('zero or more');
    expect(client.spies.update).not.toHaveBeenCalled();
  });
});
