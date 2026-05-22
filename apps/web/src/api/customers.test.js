import { describe, expect, it, vi } from 'vitest';

import {
  createCustomerForVerifiedUser,
  loadCustomerForVerifiedUser,
  mapCustomerRow,
} from './customers.js';

const user = {
  id: '7b1a7e8c-b060-40dc-9fa6-190f3ac0be73',
  email: 'owner@example.com',
  user_metadata: {
    auth_user_id: 'forged-id',
  },
};

function makeSelectClient(row) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from,
    spies: { eq, from, maybeSingle, select },
  };
}

function makeInsertClient(row) {
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from,
    spies: { from, insert, select, single },
  };
}

describe('customer ownership api', () => {
  it('maps database customer rows to UI records', () => {
    expect(
      mapCustomerRow({
        id: 'customer-1',
        auth_user_id: user.id,
        name: 'Alex',
        phone: '+12125551212',
        email: 'owner@example.com',
        username: 'mochi-parent',
        created_at: '2026-05-16T00:00:00.000Z',
      }),
    ).toEqual({
      id: 'customer-1',
      authUserId: user.id,
      name: 'Alex',
      phone: '+12125551212',
      email: 'owner@example.com',
      username: 'mochi-parent',
      createdAt: '2026-05-16T00:00:00.000Z',
    });
  });

  it('loads the customer row for the verified Supabase auth user', async () => {
    const client = makeSelectClient({
      id: 'customer-1',
      auth_user_id: user.id,
      name: 'Alex',
      phone: '+12125551212',
      email: 'owner@example.com',
    });

    const result = await loadCustomerForVerifiedUser(client);

    expect(client.auth.getUser).toHaveBeenCalledTimes(1);
    expect(client.spies.from).toHaveBeenCalledWith('customers');
    expect(client.spies.eq).toHaveBeenCalledWith('auth_user_id', user.id);
    expect(result.customer).toMatchObject({
      id: 'customer-1',
      authUserId: user.id,
      email: 'owner@example.com',
    });
  });

  it('creates a customer row owned by the verified auth user id', async () => {
    const client = makeInsertClient({
      id: 'customer-1',
      auth_user_id: user.id,
      name: 'Alex',
      phone: '+12125551212',
      email: 'owner@example.com',
    });

    const result = await createCustomerForVerifiedUser(client, {
      name: ' Alex ',
      phone: ' +12125551212 ',
    });

    expect(client.auth.getUser).toHaveBeenCalledTimes(1);
    expect(client.spies.insert).toHaveBeenCalledWith({
      auth_user_id: user.id,
      email: 'owner@example.com',
      name: 'Alex',
      phone: '+12125551212',
      username: null,
    });
    expect(result.customer).toMatchObject({
      authUserId: user.id,
      name: 'Alex',
    });
  });

  it('rejects customer work when there is no verified auth user', async () => {
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    };

    await expect(loadCustomerForVerifiedUser(client)).rejects.toThrow('Sign in required.');
  });
});
