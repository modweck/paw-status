// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  listPendingGroomerMembershipClaims,
  reviewGroomerMembershipClaim,
} from './groomerVerification.js';

function fakeSupabaseClient({ getUser, listResult, updateResult, capturedUpdate } = {}) {
  const builder = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    order() {
      return Promise.resolve(listResult || { data: [], error: null });
    },
    update(values) {
      if (capturedUpdate) capturedUpdate.values = values;
      return this;
    },
    maybeSingle() {
      return Promise.resolve(updateResult || { data: null, error: null });
    },
  };

  return {
    auth: {
      getUser: getUser || (async () => ({ data: { user: null }, error: { message: 'no' } })),
    },
    from() {
      return builder;
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
      listResult: {
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
      listResult: { data: [], error: null },
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
      listResult: { data: null, error: { message: 'boom' } },
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
      listResult: {
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

describe('reviewGroomerMembershipClaim', () => {
  const validInput = { membershipId: 'membership-1', decision: 'verify' };

  it('throws 400 when membershipId is missing', async () => {
    await expect(
      reviewGroomerMembershipClaim(
        { accessToken: adminAccessToken, env: adminEnv },
        { ...validInput, membershipId: '   ' },
      ),
    ).rejects.toMatchObject({ status: 400, code: 'ADMIN_REVIEW_MEMBERSHIP_REQUIRED' });
  });

  it('throws 400 when decision is missing or unknown', async () => {
    await expect(
      reviewGroomerMembershipClaim(
        { accessToken: adminAccessToken, env: adminEnv },
        { ...validInput, decision: '' },
      ),
    ).rejects.toMatchObject({ status: 400, code: 'ADMIN_REVIEW_DECISION_INVALID' });

    await expect(
      reviewGroomerMembershipClaim(
        { accessToken: adminAccessToken, env: adminEnv },
        { ...validInput, decision: 'maybe' },
      ),
    ).rejects.toMatchObject({ status: 400, code: 'ADMIN_REVIEW_DECISION_INVALID' });
  });

  it('throws 401 when no token is provided even with valid input', async () => {
    await expect(
      reviewGroomerMembershipClaim({ accessToken: '', env: adminEnv }, validInput),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('verifies a pending claim and writes verified status', async () => {
    const capturedUpdate = {};
    const supabase = fakeSupabaseClient({
      getUser: async () => adminUserPayload,
      updateResult: {
        data: {
          id: 'membership-1',
          role: 'owner',
          status: 'verified',
          updated_at: '2026-05-23T15:00:00Z',
        },
        error: null,
      },
      capturedUpdate,
    });

    const result = await reviewGroomerMembershipClaim(
      { accessToken: adminAccessToken, env: adminEnv, supabase },
      { membershipId: 'membership-1', decision: 'verify' },
    );

    expect(capturedUpdate.values).toMatchObject({ status: 'verified' });
    expect(capturedUpdate.values.updated_at).toEqual(expect.any(String));
    expect(result).toEqual({
      id: 'membership-1',
      role: 'owner',
      status: 'verified',
      updatedAt: '2026-05-23T15:00:00Z',
    });
  });

  it('rejects a pending claim and writes rejected status', async () => {
    const capturedUpdate = {};
    const supabase = fakeSupabaseClient({
      getUser: async () => adminUserPayload,
      updateResult: {
        data: {
          id: 'membership-1',
          role: 'owner',
          status: 'rejected',
          updated_at: '2026-05-23T15:00:00Z',
        },
        error: null,
      },
      capturedUpdate,
    });

    await reviewGroomerMembershipClaim(
      { accessToken: adminAccessToken, env: adminEnv, supabase },
      { membershipId: 'membership-1', decision: 'reject' },
    );

    expect(capturedUpdate.values).toMatchObject({ status: 'rejected' });
  });

  it('returns 409 when the claim is no longer pending (concurrency)', async () => {
    const supabase = fakeSupabaseClient({
      getUser: async () => adminUserPayload,
      updateResult: { data: null, error: null },
    });

    await expect(
      reviewGroomerMembershipClaim(
        { accessToken: adminAccessToken, env: adminEnv, supabase },
        validInput,
      ),
    ).rejects.toMatchObject({ status: 409, code: 'ADMIN_REVIEW_NOT_PENDING' });
  });

  it('wraps Supabase update errors with a 500 status', async () => {
    const supabase = fakeSupabaseClient({
      getUser: async () => adminUserPayload,
      updateResult: { data: null, error: { message: 'boom' } },
    });

    await expect(
      reviewGroomerMembershipClaim(
        { accessToken: adminAccessToken, env: adminEnv, supabase },
        validInput,
      ),
    ).rejects.toMatchObject({ status: 500, code: 'ADMIN_REVIEW_QUERY_FAILED' });
  });

  it('accepts decision values regardless of case and surrounding whitespace', async () => {
    const supabase = fakeSupabaseClient({
      getUser: async () => adminUserPayload,
      updateResult: {
        data: {
          id: 'membership-1',
          role: 'owner',
          status: 'verified',
          updated_at: '2026-05-23T15:00:00Z',
        },
        error: null,
      },
    });

    await expect(
      reviewGroomerMembershipClaim(
        { accessToken: adminAccessToken, env: adminEnv, supabase },
        { membershipId: 'membership-1', decision: '  VERIFY  ' },
      ),
    ).resolves.toMatchObject({ status: 'verified' });
  });
});
