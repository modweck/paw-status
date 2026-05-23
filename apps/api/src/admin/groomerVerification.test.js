// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { listPendingGroomerMembershipClaims } from './groomerVerification.js';

function fakeSupabaseClient({ getUser, fromResult }) {
  const built = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    order() {
      return Promise.resolve(fromResult);
    },
  };

  return {
    auth: {
      getUser: getUser || (async () => ({ data: { user: null }, error: { message: 'no' } })),
    },
    from() {
      return built;
    },
  };
}

const adminEnv = { ADMIN_BOOTSTRAP_EMAILS: 'admin@example.com' };
const adminAccessToken = 'good-token';
const adminUserPayload = {
  data: { user: { id: 'u1', email: 'admin@example.com' } },
  error: null,
};

describe('listPendingGroomerMembershipClaims', () => {
  it('throws 401 when no token is provided', async () => {
    await expect(
      listPendingGroomerMembershipClaims({ accessToken: '', env: adminEnv }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('shapes each pending claim with account and groomer fields', async () => {
    const supabase = fakeSupabaseClient({
      getUser: async () => adminUserPayload,
      fromResult: {
        data: [
          {
            id: 'membership-1',
            role: 'owner',
            created_at: '2026-05-23T12:00:00Z',
            groomer_account: {
              id: 'account-1',
              name: 'Jill',
              email: 'jill@example.com',
              phone: '555-1212',
            },
            groomer: {
              id: 'groomer-1',
              name: 'Jill at Happy Tails',
              salon: 'Happy Tails',
              address: '123 Main St',
              phone: '555-9999',
              website: 'https://happytails.example',
            },
          },
        ],
        error: null,
      },
    });

    const claims = await listPendingGroomerMembershipClaims({
      accessToken: adminAccessToken,
      env: adminEnv,
      supabase,
    });

    expect(claims).toEqual([
      {
        id: 'membership-1',
        role: 'owner',
        createdAt: '2026-05-23T12:00:00Z',
        account: {
          id: 'account-1',
          name: 'Jill',
          email: 'jill@example.com',
          phone: '555-1212',
        },
        groomer: {
          id: 'groomer-1',
          name: 'Jill at Happy Tails',
          salon: 'Happy Tails',
          address: '123 Main St',
          phone: '555-9999',
          website: 'https://happytails.example',
        },
      },
    ]);
  });

  it('returns an empty array when no pending claims exist', async () => {
    const supabase = fakeSupabaseClient({
      getUser: async () => adminUserPayload,
      fromResult: { data: [], error: null },
    });

    await expect(
      listPendingGroomerMembershipClaims({
        accessToken: adminAccessToken,
        env: adminEnv,
        supabase,
      }),
    ).resolves.toEqual([]);
  });

  it('wraps Supabase query errors with a 500 status', async () => {
    const supabase = fakeSupabaseClient({
      getUser: async () => adminUserPayload,
      fromResult: { data: null, error: { message: 'boom' } },
    });

    await expect(
      listPendingGroomerMembershipClaims({
        accessToken: adminAccessToken,
        env: adminEnv,
        supabase,
      }),
    ).rejects.toMatchObject({ status: 500, code: 'ADMIN_GROOMER_CLAIMS_QUERY_FAILED' });
  });

  it('handles missing nested account or groomer rows defensively', async () => {
    const supabase = fakeSupabaseClient({
      getUser: async () => adminUserPayload,
      fromResult: {
        data: [
          {
            id: 'membership-2',
            role: 'owner',
            created_at: '2026-05-23T13:00:00Z',
            groomer_account: null,
            groomer: null,
          },
        ],
        error: null,
      },
    });

    const claims = await listPendingGroomerMembershipClaims({
      accessToken: adminAccessToken,
      env: adminEnv,
      supabase,
    });

    expect(claims[0].account).toEqual({ id: null, name: null, email: null, phone: null });
    expect(claims[0].groomer).toEqual({
      id: null,
      name: null,
      salon: null,
      address: null,
      phone: null,
      website: null,
    });
  });
});
