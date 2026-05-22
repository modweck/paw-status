import { describe, expect, it } from 'vitest';

import { AUTH_CALLBACK_PATH, buildAuthRedirectUrl, isAuthCallbackPath } from './authRedirect.js';

describe('authRedirect', () => {
  it('uses the stable auth callback route', () => {
    expect(AUTH_CALLBACK_PATH).toBe('/auth/callback');
    expect(isAuthCallbackPath('/auth/callback')).toBe(true);
    expect(isAuthCallbackPath('/book')).toBe(false);
  });

  it('builds absolute redirect URLs for Supabase magic links', () => {
    expect(buildAuthRedirectUrl('http://localhost:5173')).toBe('http://localhost:5173/auth/callback');
  });
});
