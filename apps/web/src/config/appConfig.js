const buildConfig = typeof __APP_CONFIG__ === 'undefined' ? {} : __APP_CONFIG__;

export function normalizeBoolean(value) {
  return value === true || value === 'true';
}

export function resolveAppConfig(overrides = buildConfig) {
  const supabaseUrl = overrides.SUPABASE_URL || '';
  const supabasePublishableKey = overrides.SUPABASE_PUBLISHABLE_KEY || '';

  return {
    supabaseUrl,
    supabasePublishableKey,
    enableGroomerDashboard: normalizeBoolean(overrides.ENABLE_GROOMER_DASHBOARD),
    isSupabaseConfigured: Boolean(supabaseUrl && supabasePublishableKey),
  };
}

export const appConfig = resolveAppConfig();
