// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { safeDecodeMembershipId, toPublicAdminErrorBody } from './adminErrors.js';

describe('toPublicAdminErrorBody', () => {
  it('maps known error codes to their safe public message', () => {
    expect(toPublicAdminErrorBody({ code: 'ADMIN_AUTH_REQUIRED' })).toEqual({
      code: 'ADMIN_AUTH_REQUIRED',
      error: 'Sign in to continue.',
    });
  });

  it('falls back to a generic message and code when the error is unknown', () => {
    expect(toPublicAdminErrorBody({ code: 'SOMETHING_NEW' })).toEqual({
      code: 'SOMETHING_NEW',
      error: 'Admin verification request failed.',
    });
  });

  it('uses the default code when no code is provided', () => {
    expect(toPublicAdminErrorBody({})).toEqual({
      code: 'ADMIN_GROOMER_VERIFICATION_ERROR',
      error: 'Admin verification request failed.',
    });
  });

  it('handles null or undefined input', () => {
    expect(toPublicAdminErrorBody(null)).toEqual({
      code: 'ADMIN_GROOMER_VERIFICATION_ERROR',
      error: 'Admin verification request failed.',
    });
    expect(toPublicAdminErrorBody(undefined)).toEqual({
      code: 'ADMIN_GROOMER_VERIFICATION_ERROR',
      error: 'Admin verification request failed.',
    });
  });

  it('never exposes a raw .message field from the input', () => {
    const result = toPublicAdminErrorBody({
      code: 'ADMIN_AUTH_REQUIRED',
      message: 'raw Supabase: token expired at row 42',
    });
    expect(result.error).toBe('Sign in to continue.');
    expect(result.error).not.toMatch(/Supabase/);
  });
});

describe('safeDecodeMembershipId', () => {
  it('decodes a properly encoded segment', () => {
    expect(safeDecodeMembershipId('abc-123')).toBe('abc-123');
    expect(safeDecodeMembershipId('a%20b')).toBe('a b');
  });

  it('returns an empty string for empty/null input', () => {
    expect(safeDecodeMembershipId('')).toBe('');
    expect(safeDecodeMembershipId(null)).toBe('');
    expect(safeDecodeMembershipId(undefined)).toBe('');
  });

  it('throws a 400 with code ADMIN_REVIEW_MEMBERSHIP_MALFORMED on malformed percent-escapes', () => {
    expect(() => safeDecodeMembershipId('%E0%A4%A')).toThrow(
      expect.objectContaining({
        status: 400,
        code: 'ADMIN_REVIEW_MEMBERSHIP_MALFORMED',
      }),
    );
  });
});
