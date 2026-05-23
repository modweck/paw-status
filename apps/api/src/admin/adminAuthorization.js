import { createClient } from '@supabase/supabase-js';

// Server-side only. Never read VITE_-prefixed env vars here — those are bundled
// into the browser by Vite and would leak any secret stored under that prefix.
const SUPABASE_URL_KEYS = ['SUPABASE_URL'];
const SUPABASE_SECRET_KEYS = ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const ADMIN_ALLOWLIST_KEYS = ['ADMIN_BOOTSTRAP_EMAILS'];

function authError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function firstEnv(env, keys) {
  for (const key of keys) {
    const value = env?.[key];
    if (value) return value;
  }

  return '';
}

export function parseAdminAllowlist(rawValue = '') {
  return String(rawValue)
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function getAdminAllowlist(env = process.env) {
  return parseAdminAllowlist(firstEnv(env, ADMIN_ALLOWLIST_KEYS));
}

export function createAdminSupabaseClient(env = process.env) {
  const url = firstEnv(env, SUPABASE_URL_KEYS);
  const secretKey = firstEnv(env, SUPABASE_SECRET_KEYS);

  if (!url || !secretKey) {
    throw authError(500, 'ADMIN_SUPABASE_ENV_MISSING', 'Server Supabase environment is missing.');
  }

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function requireAdminContext({
  accessToken = '',
  env = process.env,
  supabase,
} = {}) {
  const cleanedToken = String(accessToken || '').trim();
  if (!cleanedToken) {
    throw authError(401, 'ADMIN_AUTH_REQUIRED', 'Sign in to continue.');
  }

  const allowlist = getAdminAllowlist(env);
  if (allowlist.length === 0) {
    throw authError(
      503,
      'ADMIN_ALLOWLIST_EMPTY',
      'Admin allowlist is not configured on the server.',
    );
  }

  const client = supabase || createAdminSupabaseClient(env);
  const { data, error } = await client.auth.getUser(cleanedToken);
  if (error || !data?.user) {
    throw authError(401, 'ADMIN_AUTH_INVALID', 'Sign in to continue.');
  }

  const email = String(data.user.email || '').trim().toLowerCase();
  if (!email || !allowlist.includes(email)) {
    throw authError(403, 'ADMIN_AUTH_FORBIDDEN', 'You are not authorized to use the admin area.');
  }

  return {
    supabase: client,
    user: data.user,
  };
}
