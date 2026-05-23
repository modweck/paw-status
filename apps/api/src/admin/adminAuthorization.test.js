// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  getAdminAllowlist,
  parseAdminAllowlist,
  requireAdminContext,
} from './adminAuthorization.js';

function fakeSupabase({ getUser } = {}) {
  return {
    auth: {
      getUser: getUser || (async () => ({ data: { user: null }, error: null })),
    },
  };
}

describe('parseAdminAllowlist', () => {
  it('lowercases, trims, and drops empty entries', () => {
    expect(parseAdminAllowlist(' Alice@Example.COM, ,bob@example.com ,')).toEqual([
      'alice@example.com',
      'bob@example.com',
    ]);
  });

  it('returns an empty array for missing input', () => {
    expect(parseAdminAllowlist()).toEqual([]);
    expect(parseAdminAllowlist('')).toEqual([]);
  });
});

describe('getAdminAllowlist', () => {
  it('reads ADMIN_BOOTSTRAP_EMAILS from the provided env', () => {
    const env = { ADMIN_BOOTSTRAP_EMAILS: 'a@b.com,c@d.com' };
    expect(getAdminAllowlist(env)).toEqual(['a@b.com', 'c@d.com']);
  });

  it('returns an empty array when the env var is missing', () => {
    expect(getAdminAllowlist({})).toEqual([]);
  });
});

describe('requireAdminContext', () => {
  const baseEnv = { ADMIN_BOOTSTRAP_EMAILS: 'admin@example.com' };

  it('rejects missing access tokens with 401', async () => {
    await expect(
      requireAdminContext({ accessToken: '', env: baseEnv, supabase: fakeSupabase() }),
    ).rejects.toMatchObject({ status: 401, code: 'ADMIN_AUTH_REQUIRED' });
  });

  it('rejects whitespace-only access tokens with 401', async () => {
    await expect(
      requireAdminContext({ accessToken: '   ', env: baseEnv, supabase: fakeSupabase() }),
    ).rejects.toMatchObject({ status: 401, code: 'ADMIN_AUTH_REQUIRED' });
  });

  it('rejects when the admin allowlist is empty', async () => {
    await expect(
      requireAdminContext({
        accessToken: 'token',
        env: { ADMIN_BOOTSTRAP_EMAILS: '' },
        supabase: fakeSupabase(),
      }),
    ).rejects.toMatchObject({ status: 503, code: 'ADMIN_ALLOWLIST_EMPTY' });
  });

  it('rejects when Supabase reports an invalid token', async () => {
    const supabase = fakeSupabase({
      getUser: async () => ({ data: { user: null }, error: { message: 'invalid' } }),
    });

    await expect(
      requireAdminContext({ accessToken: 'bad', env: baseEnv, supabase }),
    ).rejects.toMatchObject({ status: 401, code: 'ADMIN_AUTH_INVALID' });
  });

  it('rejects users whose email is not on the allowlist', async () => {
    const supabase = fakeSupabase({
      getUser: async () => ({
        data: { user: { id: 'u1', email: 'someone@example.com' } },
        error: null,
      }),
    });

    await expect(
      requireAdminContext({ accessToken: 'good', env: baseEnv, supabase }),
    ).rejects.toMatchObject({ status: 403, code: 'ADMIN_AUTH_FORBIDDEN' });
  });

  it('rejects users with no email returned from Supabase', async () => {
    const supabase = fakeSupabase({
      getUser: async () => ({ data: { user: { id: 'u1', email: null } }, error: null }),
    });

    await expect(
      requireAdminContext({ accessToken: 'good', env: baseEnv, supabase }),
    ).rejects.toMatchObject({ status: 403, code: 'ADMIN_AUTH_FORBIDDEN' });
  });

  it('returns the supabase client and user when the email is on the allowlist', async () => {
    const user = { id: 'u1', email: 'Admin@Example.com' };
    const supabase = fakeSupabase({
      getUser: async () => ({ data: { user }, error: null }),
    });

    const result = await requireAdminContext({ accessToken: 'good', env: baseEnv, supabase });
    expect(result.user).toBe(user);
    expect(result.supabase).toBe(supabase);
  });

  it('matches the allowlist after trimming whitespace and case from the Supabase email', async () => {
    const user = { id: 'u1', email: '  Admin@Example.COM  ' };
    const supabase = fakeSupabase({
      getUser: async () => ({ data: { user }, error: null }),
    });

    const result = await requireAdminContext({ accessToken: 'good', env: baseEnv, supabase });
    expect(result.user).toBe(user);
  });
});
