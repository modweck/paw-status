import { describe, expect, it, vi } from 'vitest';

import {
  createOffering,
  deleteOffering,
  loadOfferings,
  updateOffering,
} from './groomerOfferings.js';

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

const offeringRow = {
  id: 'offering-1',
  groomer_id: 'groomer-1',
  service: 'full-groom',
  duration_minutes: 90,
  base_price_cents: 8500,
  size_modifier_json: null,
  breed_modifier_json: null,
};

describe('groomerOfferings api', () => {
  it('loads offerings for a groomer, oldest first', async () => {
    const client = makeListClient([offeringRow]);

    const offerings = await loadOfferings(client, 'groomer-1');

    expect(client.spies.from).toHaveBeenCalledWith('groomer_offerings');
    expect(client.spies.eq).toHaveBeenCalledWith('groomer_id', 'groomer-1');
    expect(offerings).toEqual([
      {
        id: 'offering-1',
        groomerId: 'groomer-1',
        service: 'full-groom',
        durationMinutes: 90,
        basePriceCents: 8500,
        sizeModifiers: null,
        breedModifiers: null,
      },
    ]);
  });

  it('creates an offering with a cleaned row', async () => {
    const client = makeInsertClient(offeringRow);

    await createOffering(client, 'groomer-1', {
      service: '  full-groom ',
      durationMinutes: 90,
      basePriceCents: 8500,
    });

    expect(client.spies.insert).toHaveBeenCalledWith({
      groomer_id: 'groomer-1',
      service: 'full-groom',
      duration_minutes: 90,
      base_price_cents: 8500,
      size_modifier_json: null,
      breed_modifier_json: null,
    });
  });

  it('updates an offering by id', async () => {
    const client = makeUpdateClient({ ...offeringRow, duration_minutes: 120 });

    const result = await updateOffering(client, 'offering-1', { durationMinutes: 120 });

    expect(client.spies.update).toHaveBeenCalledWith({ duration_minutes: 120 });
    expect(client.spies.eq).toHaveBeenCalledWith('id', 'offering-1');
    expect(result.durationMinutes).toBe(120);
  });

  it('deletes an offering by id', async () => {
    const client = makeDeleteClient();
    await deleteOffering(client, 'offering-1');
    expect(client.spies.eq).toHaveBeenCalledWith('id', 'offering-1');
  });

  it('rejects an empty service', async () => {
    const client = makeInsertClient(offeringRow);
    await expect(
      createOffering(client, 'groomer-1', { service: '  ', durationMinutes: 90 }),
    ).rejects.toThrow('Choose a service.');
    expect(client.spies.insert).not.toHaveBeenCalled();
  });

  it('rejects a non-positive duration', async () => {
    const client = makeInsertClient(offeringRow);
    await expect(
      createOffering(client, 'groomer-1', { service: 'full-groom', durationMinutes: 0 }),
    ).rejects.toThrow('Duration must be a positive number of minutes.');
  });

  it('rejects a negative price', async () => {
    const client = makeInsertClient(offeringRow);
    await expect(
      createOffering(client, 'groomer-1', {
        service: 'full-groom',
        durationMinutes: 60,
        basePriceCents: -100,
      }),
    ).rejects.toThrow('Price cannot be negative.');
  });
});
