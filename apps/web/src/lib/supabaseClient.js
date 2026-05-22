import { createClient } from '@supabase/supabase-js';

import { appConfig } from '../config/appConfig.js';

let client;

export function getSupabaseClient() {
  if (!appConfig.isSupabaseConfigured) return null;

  if (!client) {
    client = createClient(appConfig.supabaseUrl, appConfig.supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return client;
}

export function requireSupabaseClient() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.');
  }

  return supabase;
}
