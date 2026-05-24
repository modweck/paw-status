// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  getGroomerVerificationAuditTrail,
  listPendingGroomerMembershipClaims,
  reviewGroomerMembershipClaim,
} from './groomerVerification.js';

function fakeSupabaseClient(config = {}) {
  function makeBuilder(tableName) {
    const state = { isMaybeSingle: false, insertCalled: false };

    const builder = {
      select(cols) {
        if (config.capturedSelect) {
          config.capturedSelect[tableName] = cols;
        }
        return this;
      },
      eq(col, val) {
        if (tableName === 'groomer_membership_review_events' && config.capturedAuditFilters) {
          config.capturedAuditFilters[col] = val;
        }
        return this;
      },
      order() {
        return this;
      },
      limit(value) {
        if (tableName === 'groomer_membership_review_events' && config.capturedAuditFilters) {
          config.capturedAuditFilters.__limit = value;
        }
        return this;
      },
      maybeSingle() {
        state.isMaybeSingle = true;
        return this;
      },
      update(values) {
        if (config.capturedUpdate) config.capturedUpdate.values = values;
        return this;
      },
      insert(values) {
        state.insertCalled = true;
        if (config.capturedInsert) {
          config.capturedInsert.table = tableName;
          config.capturedInsert.values = values;
        }
        return this;
      },
      then(onFulfilled, onRejected) {
        let result;
        if (tableName === 'groomer_membership_review_events') {
          result = state.insertCalled
            ? config.insertResult || { error: null }
            : config.auditListResult || { data: [], error: null };
        } else if (state.isMaybeSingle) {
          result = config.updateResult || { data: null, error: null };
        } else {
          result = config.listResult || { data: [], error: null };
        }
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
    };

    return builder;
  }

  return {
    auth: {
      getUser:
        config.getUser ||
        (async () => ({ data: { user: null }, error: { message: 'no' } })),
    },
    from(table) {
      return makeBuilder(table);
    },
  };
}

const adminEnv = { ADMIN_BOOTSTRAP_EMAILS: 'admin@example.com' };
const adminAccessToken = 'good-token';
const adminUser = { id: 'u1', email: 'admin@example.com' };
const adminUserPayload = { data: { user: adminUser }, error: null };

const VALID_MEMBERSHIP_UUID = '11111111-1111-4111-8111-111111111111';

function reviewSuccessResult(overrides = {}) {
  return {
    data: {
      id: VALID_MEMBERSHIP_UUID,
      role: 'owner',
      status: 'verified',
      updated_at: '2026-05-23T15:00:00Z',
      groomer: { name: 'Jill at Happy Tails', salon: 'Happy Tails' },
      groomer_account: { name: 'Jill', email: 'jill@example.com' },
      ...overrides,
    },
    error: null,
  };
}

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
            id: VALID_MEMBERSHIP_UUID,
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
        id: VALID_MEMBERSHIP_UUID,
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
            id: VALID_MEMBERSHIP_UUID,
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
  const validInput = { membershipId: VALID_MEMBERSHIP_UUID, decision: 'verify' };

  it('throws 400 when membershipId is missing', async () => {
    await expect(
      reviewGroomerMembershipClaim(
        { accessToken: adminAccessToken, env: adminEnv },
        { ...validInput, membershipId: '   ' },
      ),
    ).rejects.toMatchObject({ status: 400, code: 'ADMIN_REVIEW_MEMBERSHIP_REQUIRED' });
  });

  it('throws 400 when membershipId is not a valid UUID', async () => {
    await expect(
      reviewGroomerMembershipClaim(
        { accessToken: adminAccessToken, env: adminEnv },
        { ...validInput, membershipId: 'not-a-uuid' },
      ),
    ).rejects.toMatchObject({ status: 400, code: 'ADMIN_REVIEW_MEMBERSHIP_MALFORMED' });
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

  it('verifies a pending claim and writes verified status plus an audit event', async () => {
    const capturedUpdate = {};
    const capturedInsert = {};
    const supabase = fakeSupabaseClient({
      getUser: async () => adminUserPayload,
      updateResult: reviewSuccessResult(),
      capturedUpdate,
      capturedInsert,
    });

    const result = await reviewGroomerMembershipClaim(
      { accessToken: adminAccessToken, env: adminEnv, supabase },
      { membershipId: VALID_MEMBERSHIP_UUID, decision: 'verify', reviewerNote: '  Looks good  ' },
    );

    expect(capturedUpdate.values).toMatchObject({ status: 'verified' });
    expect(capturedUpdate.values.updated_at).toEqual(expect.any(String));
    expect(result).toEqual({
      id: VALID_MEMBERSHIP_UUID,
      role: 'owner',
      status: 'verified',
      updatedAt: '2026-05-23T15:00:00Z',
    });

    expect(capturedInsert.table).toBe('groomer_membership_review_events');
    expect(capturedInsert.values).toEqual({
      membership_id: VALID_MEMBERSHIP_UUID,
      reviewer_auth_user_id: 'u1',
      reviewer_email: 'admin@example.com',
      decision: 'verify',
      previous_status: 'pending',
      next_status: 'verified',
      reviewer_note: 'Looks good',
    });
  });

  it('rejects a pending claim and writes a rejected audit event', async () => {
    const capturedInsert = {};
    const supabase = fakeSupabaseClient({
      getUser: async () => adminUserPayload,
      updateResult: reviewSuccessResult({ status: 'rejected' }),
      capturedInsert,
    });

    await reviewGroomerMembershipClaim(
      { accessToken: adminAccessToken, env: adminEnv, supabase },
      { membershipId: VALID_MEMBERSHIP_UUID, decision: 'reject' },
    );

    expect(capturedInsert.values).toMatchObject({
      decision: 'reject',
      next_status: 'rejected',
      reviewer_note: null,
    });
  });

  it('returns 409 when the claim is no longer pending and skips the audit insert', async () => {
    const capturedInsert = {};
    const supabase = fakeSupabaseClient({
      getUser: async () => adminUserPayload,
      updateResult: { data: null, error: null },
      capturedInsert,
    });

    await expect(
      reviewGroomerMembershipClaim(
        { accessToken: adminAccessToken, env: adminEnv, supabase },
        validInput,
      ),
    ).rejects.toMatchObject({ status: 409, code: 'ADMIN_REVIEW_NOT_PENDING' });

    expect(capturedInsert.table).toBeUndefined();
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

  it('returns success even if the audit insert fails (fail-open observability)', async () => {
    const supabase = fakeSupabaseClient({
      getUser: async () => adminUserPayload,
      updateResult: reviewSuccessResult(),
      insertResult: { error: { code: 'XX000', message: 'audit table missing' } },
    });

    await expect(
      reviewGroomerMembershipClaim(
        { accessToken: adminAccessToken, env: adminEnv, supabase },
        validInput,
      ),
    ).resolves.toMatchObject({ id: VALID_MEMBERSHIP_UUID, status: 'verified' });
  });

  it('logs a structured notify-needed warning with recipient info after a successful review', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const supabase = fakeSupabaseClient({
      getUser: async () => adminUserPayload,
      updateResult: reviewSuccessResult(),
    });

    try {
      await reviewGroomerMembershipClaim(
        { accessToken: adminAccessToken, env: adminEnv, supabase },
        { membershipId: VALID_MEMBERSHIP_UUID, decision: 'verify' },
      );

      const notifyCall = warnSpy.mock.calls.find((args) =>
        String(args[0] || '').includes('notify-needed'),
      );
      expect(notifyCall).toBeDefined();
      expect(notifyCall[1]).toMatchObject({
        notifyNeeded: true,
        membershipId: VALID_MEMBERSHIP_UUID,
        decision: 'verify',
        nextStatus: 'verified',
        recipientEmail: 'jill@example.com',
        recipientName: 'Jill',
        groomerName: 'Jill at Happy Tails',
        groomerSalon: 'Happy Tails',
      });
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('emits notify-needed with nulls when joined groomer/account rows are missing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const supabase = fakeSupabaseClient({
      getUser: async () => adminUserPayload,
      updateResult: reviewSuccessResult({ groomer: null, groomer_account: null }),
    });

    try {
      await reviewGroomerMembershipClaim(
        { accessToken: adminAccessToken, env: adminEnv, supabase },
        { membershipId: VALID_MEMBERSHIP_UUID, decision: 'verify' },
      );

      const notifyCall = warnSpy.mock.calls.find((args) =>
        String(args[0] || '').includes('notify-needed'),
      );
      expect(notifyCall[1]).toMatchObject({
        recipientEmail: null,
        recipientName: null,
        groomerName: null,
        groomerSalon: null,
      });
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('selects the joined groomer and groomer_account columns needed for notify-needed', async () => {
    const capturedSelect = {};
    const supabase = fakeSupabaseClient({
      getUser: async () => adminUserPayload,
      updateResult: reviewSuccessResult(),
      capturedSelect,
    });

    await reviewGroomerMembershipClaim(
      { accessToken: adminAccessToken, env: adminEnv, supabase },
      { membershipId: VALID_MEMBERSHIP_UUID, decision: 'verify' },
    );

    const selectString = capturedSelect.groomer_memberships || '';
    expect(selectString).toContain('groomers');
    expect(selectString).toContain('groomer_accounts');
    expect(selectString).toContain('email');
    expect(selectString).toContain('name');
  });

  it('lowercases the reviewer email written to the audit event', async () => {
    const capturedInsert = {};
    const supabase = fakeSupabaseClient({
      getUser: async () => ({
        data: { user: { id: 'u1', email: 'Admin@Example.COM' } },
        error: null,
      }),
      updateResult: reviewSuccessResult(),
      capturedInsert,
    });

    await reviewGroomerMembershipClaim(
      { accessToken: adminAccessToken, env: adminEnv, supabase },
      { membershipId: VALID_MEMBERSHIP_UUID, decision: 'verify' },
    );

    expect(capturedInsert.values.reviewer_email).toBe('admin@example.com');
  });
});

describe('getGroomerVerificationAuditTrail', () => {
  it('throws 401 when no token is provided', async () => {
    await expect(
      getGroomerVerificationAuditTrail({ accessToken: '', env: adminEnv }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('returns shaped audit events with default limit and no filter', async () => {
    const capturedAuditFilters = {};
    const supabase = fakeSupabaseClient({
      getUser: async () => adminUserPayload,
      auditListResult: {
        data: [
          {
            id: 'event-1',
            membership_id: VALID_MEMBERSHIP_UUID,
            reviewer_auth_user_id: 'u1',
            reviewer_email: 'admin@example.com',
            decision: 'verify',
            previous_status: 'pending',
            next_status: 'verified',
            reviewer_note: 'Profile checks out',
            created_at: '2026-05-23T15:00:00Z',
          },
        ],
        error: null,
      },
      capturedAuditFilters,
    });

    const events = await getGroomerVerificationAuditTrail(
      { accessToken: adminAccessToken, env: adminEnv, supabase },
      {},
    );

    expect(events).toEqual([
      {
        id: 'event-1',
        membershipId: VALID_MEMBERSHIP_UUID,
        reviewerAuthUserId: 'u1',
        reviewerEmail: 'admin@example.com',
        decision: 'verify',
        previousStatus: 'pending',
        nextStatus: 'verified',
        reviewerNote: 'Profile checks out',
        createdAt: '2026-05-23T15:00:00Z',
      },
    ]);
    expect(capturedAuditFilters.membership_id).toBeUndefined();
    expect(capturedAuditFilters.__limit).toBe(50);
  });

  it('filters by membershipId when one is provided', async () => {
    const capturedAuditFilters = {};
    const supabase = fakeSupabaseClient({
      getUser: async () => adminUserPayload,
      auditListResult: { data: [], error: null },
      capturedAuditFilters,
    });

    await getGroomerVerificationAuditTrail(
      { accessToken: adminAccessToken, env: adminEnv, supabase },
      { membershipId: `  ${VALID_MEMBERSHIP_UUID}  ` },
    );

    expect(capturedAuditFilters.membership_id).toBe(VALID_MEMBERSHIP_UUID);
  });

  it('selects every column that shapeAuditEvent reads (guards against silent nulls)', async () => {
    const capturedSelect = {};
    const supabase = fakeSupabaseClient({
      getUser: async () => adminUserPayload,
      auditListResult: { data: [], error: null },
      capturedSelect,
    });

    await getGroomerVerificationAuditTrail(
      { accessToken: adminAccessToken, env: adminEnv, supabase },
      {},
    );

    const selectString = capturedSelect.groomer_membership_review_events || '';
    for (const column of [
      'id',
      'membership_id',
      'reviewer_auth_user_id',
      'reviewer_email',
      'decision',
      'previous_status',
      'next_status',
      'reviewer_note',
      'created_at',
    ]) {
      expect(selectString).toContain(column);
    }
  });

  it('throws 400 when audit filter membershipId is not a valid UUID', async () => {
    const supabase = fakeSupabaseClient({
      getUser: async () => adminUserPayload,
      auditListResult: { data: [], error: null },
    });

    await expect(
      getGroomerVerificationAuditTrail(
        { accessToken: adminAccessToken, env: adminEnv, supabase },
        { membershipId: 'not-a-uuid' },
      ),
    ).rejects.toMatchObject({ status: 400, code: 'ADMIN_REVIEW_MEMBERSHIP_MALFORMED' });
  });

  it('caps the limit at the configured maximum', async () => {
    const capturedAuditFilters = {};
    const supabase = fakeSupabaseClient({
      getUser: async () => adminUserPayload,
      auditListResult: { data: [], error: null },
      capturedAuditFilters,
    });

    await getGroomerVerificationAuditTrail(
      { accessToken: adminAccessToken, env: adminEnv, supabase },
      { limit: 9999 },
    );

    expect(capturedAuditFilters.__limit).toBe(200);
  });

  it('falls back to the default limit for invalid input', async () => {
    const capturedAuditFilters = {};
    const supabase = fakeSupabaseClient({
      getUser: async () => adminUserPayload,
      auditListResult: { data: [], error: null },
      capturedAuditFilters,
    });

    await getGroomerVerificationAuditTrail(
      { accessToken: adminAccessToken, env: adminEnv, supabase },
      { limit: 'banana' },
    );

    expect(capturedAuditFilters.__limit).toBe(50);
  });

  it('wraps Supabase audit query errors with a 500 status', async () => {
    const supabase = fakeSupabaseClient({
      getUser: async () => adminUserPayload,
      auditListResult: { data: null, error: { message: 'boom' } },
    });

    await expect(
      getGroomerVerificationAuditTrail(
        { accessToken: adminAccessToken, env: adminEnv, supabase },
        {},
      ),
    ).rejects.toMatchObject({ status: 500, code: 'ADMIN_REVIEW_AUDIT_QUERY_FAILED' });
  });
});
