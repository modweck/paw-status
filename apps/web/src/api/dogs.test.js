import { describe, expect, it, vi } from 'vitest';

import {
  createDogForCustomer,
  DOG_SIZE_OPTIONS,
  loadDogsForCustomer,
  mapDogRow,
} from './dogs.js';

const customer = {
  id: 'customer-1',
  authUserId: 'auth-user-1',
};

function makeDogSelectClient(rows) {
  const order = vi.fn().mockResolvedValue({ data: rows, error: null });
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));

  return {
    from,
    spies: { eq, from, order, select },
  };
}

function makeDogInsertClient(row) {
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));

  return {
    from,
    spies: { from, insert, select, single },
  };
}

describe('dog ownership api', () => {
  it('maps database dog rows to UI records', () => {
    expect(
      mapDogRow({
        id: 'dog-1',
        customer_id: customer.id,
      name: 'Mochi',
      breed: 'Cavapoo',
      size: 'small',
      birthdate: '2022-04-10',
      weight_lbs: 18,
      coat_type: 'Curly',
      temperament: 'Nervous around dryers',
      allergies: 'Chicken',
      preferred_service_id: 'full-groom',
      preferred_groomer_id: 'groomer-1',
      preferred_groomer_name: 'Paw House',
      last_groomed_at: '2026-04-01',
      grooming_interval_weeks: 6,
      notes: 'Nervous around dryers',
      created_at: '2026-05-16T00:00:00.000Z',
    }),
    ).toEqual({
      id: 'dog-1',
      customerId: customer.id,
      name: 'Mochi',
      breed: 'Cavapoo',
      size: 'small',
      birthdate: '2022-04-10',
      weightLbs: 18,
      coatType: 'Curly',
      temperament: 'Nervous around dryers',
      allergies: 'Chicken',
      preferredServiceId: 'full-groom',
      preferredGroomerId: 'groomer-1',
      preferredGroomerName: 'Paw House',
      lastGroomedAt: '2026-04-01',
      groomingIntervalWeeks: 6,
      notes: 'Nervous around dryers',
      createdAt: '2026-05-16T00:00:00.000Z',
    });
  });

  it('loads dogs through the verified customer row id', async () => {
    const client = makeDogSelectClient([
      {
        id: 'dog-1',
        customer_id: customer.id,
        name: 'Mochi',
        breed: 'Cavapoo',
        size: 'small',
        notes: null,
      },
    ]);

    const dogs = await loadDogsForCustomer(client, customer);

    expect(client.spies.from).toHaveBeenCalledWith('dogs');
    expect(client.spies.eq).toHaveBeenCalledWith('customer_id', customer.id);
    expect(client.spies.order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(dogs).toEqual([
      expect.objectContaining({
        id: 'dog-1',
        customerId: customer.id,
        name: 'Mochi',
      }),
    ]);
  });

  it('creates a dog tied to the verified customer row id', async () => {
    const client = makeDogInsertClient({
      id: 'dog-1',
      customer_id: customer.id,
      name: 'Mochi',
      breed: ' Cavapoo ',
      size: 'small',
      birthdate: '2022-04-10',
      weight_lbs: 18,
      coat_type: ' Curly ',
      temperament: ' Nervous ',
      allergies: ' Chicken ',
      preferred_service_id: 'full-groom',
      preferred_groomer_id: 'groomer-1',
      preferred_groomer_name: 'Paw House',
      last_groomed_at: '2026-04-01',
      grooming_interval_weeks: 6,
      notes: 'Nervous around dryers',
    });

    const dog = await createDogForCustomer(client, customer, {
      name: ' Mochi ',
      breed: ' Cavapoo ',
      size: 'small',
      birthdate: '2022-04-10',
      weightLbs: '18',
      coatType: ' Curly ',
      temperament: ' Nervous ',
      allergies: ' Chicken ',
      preferredServiceId: ' full-groom ',
      preferredGroomerId: ' groomer-1 ',
      preferredGroomerName: ' Paw House ',
      lastGroomedAt: '2026-04-01',
      groomingIntervalWeeks: '6',
      notes: ' Nervous around dryers ',
    });

    expect(client.spies.insert).toHaveBeenCalledWith({
      customer_id: customer.id,
      name: 'Mochi',
      breed: 'Cavapoo',
      size: 'small',
      birthdate: '2022-04-10',
      weight_lbs: 18,
      coat_type: 'Curly',
      temperament: 'Nervous',
      allergies: 'Chicken',
      preferred_service_id: 'full-groom',
      preferred_groomer_id: 'groomer-1',
      preferred_groomer_name: 'Paw House',
      last_groomed_at: '2026-04-01',
      grooming_interval_weeks: 6,
      notes: 'Nervous around dryers',
    });
    expect(dog).toMatchObject({
      customerId: customer.id,
      name: 'Mochi',
    });
  });

  it('rejects dog work without an owned customer row id', async () => {
    const client = makeDogSelectClient([]);

    await expect(loadDogsForCustomer(client, null)).rejects.toThrow(
      'Customer profile required before dog profiles.',
    );
  });

  it('rejects invalid dog profile input before writing', async () => {
    const client = makeDogInsertClient({});

    await expect(
      createDogForCustomer(client, customer, {
        name: 'Mochi',
        size: 'giant',
      }),
    ).rejects.toThrow('Choose a valid dog size.');
    expect(client.spies.insert).not.toHaveBeenCalled();
    expect(DOG_SIZE_OPTIONS.map((option) => option.value)).toEqual([
      'toy',
      'small',
      'medium',
      'large',
      'xlarge',
    ]);
  });
});
