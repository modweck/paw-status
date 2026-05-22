import { describe, expect, it } from 'vitest';

import { normalizeBoolean, resolveAppConfig } from './appConfig.js';

describe('normalizeBoolean', () => {
  it('only treats true booleans and true strings as enabled', () => {
    expect(normalizeBoolean(true)).toBe(true);
    expect(normalizeBoolean('true')).toBe(true);
    expect(normalizeBoolean(false)).toBe(false);
    expect(normalizeBoolean('false')).toBe(false);
    expect(normalizeBoolean(undefined)).toBe(false);
  });
});

describe('resolveAppConfig', () => {
  it('marks Supabase configured only when both public values are present', () => {
    expect(
      resolveAppConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_key',
      }).isSupabaseConfigured,
    ).toBe(true);

    expect(resolveAppConfig({ SUPABASE_URL: 'https://example.supabase.co' }).isSupabaseConfigured).toBe(
      false,
    );
  });

  it('does not expose secret keys in the public config object', () => {
    const config = resolveAppConfig({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_key',
      SUPABASE_SECRET_KEY: 'sb_secret_should_not_escape',
    });

    expect(config).not.toHaveProperty('SUPABASE_SECRET_KEY');
    expect(config).not.toHaveProperty('supabaseSecretKey');
  });
});
