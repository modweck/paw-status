import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const CLAIM_TTL_DAYS = 7;
const DOG_SIZE_VALUES = new Set(['toy', 'small', 'medium', 'large', 'xlarge']);
const PREFERRED_WINDOW_VALUES = new Set([
  'first-available',
  'weekday-morning',
  'weekday-afternoon',
  'weekday-evening',
  'weekend',
]);
const TIME_OF_DAY_VALUES = new Set(['morning', 'afternoon', 'evening']);
const REQUEST_TIMING_TYPES = new Set(['first-available', 'preferred-date', 'backup-date']);

// TODO(backend): Move these request contracts into packages/core so the web app,
// Netlify functions, and future apps/api service validate the same shapes.
export const jsonHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};

// User-safe error thrown by validation/state-check code in this module.
// toPublicError below relies on the `userFacing` flag (not message text) so a
// raw Supabase error rethrown via `new Error(supabaseError.message)` can never
// reach the browser, even if the Supabase text coincidentally contains words
// like "valid" or "required".
function userFacingError(message) {
  const error = new Error(message);
  error.userFacing = true;
  return error;
}

function cleanOptionalText(value) {
  const cleaned = String(value || '').trim();
  return cleaned || null;
}

function cleanRequiredText(value, message) {
  const cleaned = cleanOptionalText(value);
  if (!cleaned) {
    throw userFacingError(message);
  }

  return cleaned;
}

function cleanEmail(value) {
  const cleaned = cleanRequiredText(value, 'Email is required.').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    throw userFacingError('Enter a valid email.');
  }

  return cleaned;
}

function cleanDogSize(value) {
  const cleaned = cleanRequiredText(value, 'Choose a dog size.').toLowerCase();
  if (!DOG_SIZE_VALUES.has(cleaned)) {
    throw userFacingError('Choose a valid dog size.');
  }

  return cleaned;
}

function cleanDate(value, message) {
  const cleaned = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    throw userFacingError(message);
  }

  return cleaned;
}

function cleanTimeOfDay(value) {
  const cleaned = String(value || '').trim();
  if (!TIME_OF_DAY_VALUES.has(cleaned)) {
    throw userFacingError('Choose a valid time of day.');
  }

  return cleaned;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function cleanOptionalTime(value) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return null;
  if (!TIME_PATTERN.test(cleaned)) {
    throw userFacingError('Choose a valid time.');
  }

  return cleaned;
}

function cleanPreferredWindow(window) {
  if (typeof window === 'string') {
    const legacyValue = window.trim();
    if (legacyValue === 'first-available') {
      return { type: 'first-available' };
    }
    if (PREFERRED_WINDOW_VALUES.has(legacyValue)) {
      return legacyValue;
    }
    return null;
  }

  if (!window || typeof window !== 'object') return null;
  if (!REQUEST_TIMING_TYPES.has(window.type)) return null;

  if (window.type === 'first-available') {
    return { type: 'first-available' };
  }

  const normalized = {
    type: window.type,
    date: cleanDate(
      window.date,
      window.type === 'backup-date'
        ? 'Choose a valid backup date.'
        : 'Choose a valid preferred date.',
    ),
    timeOfDay: cleanTimeOfDay(window.timeOfDay),
  };

  const time = cleanOptionalTime(window.time);
  if (time) {
    normalized.time = time;
  }

  return normalized;
}

function cleanPreferredWindows(windows = []) {
  const normalized = windows.map(cleanPreferredWindow).filter(Boolean);

  if (!normalized.length) {
    throw userFacingError('Choose first available or a preferred date.');
  }

  return normalized;
}

function claimExpiresAt(now) {
  const expiresAt = new Date(now.getTime());
  expiresAt.setUTCDate(expiresAt.getUTCDate() + CLAIM_TTL_DAYS);
  return expiresAt.toISOString();
}

export function createGuestClaimToken() {
  return randomBytes(32).toString('base64url');
}

export function hashGuestClaimToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

export function buildGuestBookingRows(input = {}, { claimToken, groomer, now = new Date() } = {}) {
  if (!groomer?.id) {
    throw userFacingError('Choose a groomer before requesting a booking.');
  }

  const service = cleanRequiredText(input.service, 'Choose a service.');
  const externalBookingUrl = cleanOptionalText(groomer.website);

  return {
    customer: {
      auth_user_id: null,
      email: cleanEmail(input.customerEmail),
      name: cleanRequiredText(input.customerName, 'Your name is required.'),
      phone: cleanRequiredText(input.customerPhone, 'Phone is required.'),
    },
    dog: {
      breed: cleanOptionalText(input.dogBreed),
      name: cleanRequiredText(input.dogName, 'Dog name is required.'),
      notes: cleanOptionalText(input.dogNotes),
      size: cleanDogSize(input.dogSize),
    },
    request: {
      customer_notes: cleanOptionalText(input.customerNotes),
      external_booking_url: externalBookingUrl,
      groomer_id: groomer.id,
      guest_claim_expires_at: claimExpiresAt(now),
      guest_claim_token_hash: hashGuestClaimToken(claimToken),
      preferred_windows: cleanPreferredWindows(input.preferredWindows || []),
      service,
      status: externalBookingUrl ? 'external_handoff' : 'requested',
    },
  };
}

export function createServerSupabaseClient(env = process.env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Server Supabase environment is missing.');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function toPublicError(error) {
  // Errors flagged with userFacing=true (via userFacingError) carry messages
  // intentionally crafted in this module to be safe for the browser. Anything
  // else — including raw Supabase/Postgres rethrows like
  // `new Error(supabaseError.message)` — is treated as an internal failure
  // and replaced with a fixed string so internal text never reaches the user
  // even if the Supabase message happens to contain words like "valid".
  if (error?.userFacing) {
    return {
      statusCode: 400,
      body: { error: error.message },
    };
  }

  return {
    statusCode: 500,
    body: {
      error: 'Something went wrong with your booking. Please try again or contact support.',
    },
  };
}

async function fetchGroomer(supabase, groomerId) {
  // TODO(backend): Move groomer eligibility checks here: active profile,
  // supported service, supported dog size, booking channel, and service area.
  const { data, error } = await supabase
    .from('groomers')
    .select('id, website')
    .eq('id', cleanRequiredText(groomerId, 'Choose a groomer before requesting a booking.'))
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function createGuestBooking({ supabase, input, now = new Date() }) {
  // TODO(backend): Add abuse controls before this service-key write path:
  // rate limiting, origin checks, bot protection, and idempotency keys.
  const claimToken = createGuestClaimToken();
  const groomer = await fetchGroomer(supabase, input.groomerId);
  const rows = buildGuestBookingRows(input, { claimToken, groomer, now });
  let customerId = '';

  try {
    // TODO(backend): Replace this multi-step insert/cleanup flow with a single
    // Postgres RPC transaction so partial customer/dog/request writes cannot
    // survive network or permission failures.
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .insert(rows.customer)
      .select('id, email')
      .single();

    if (customerError) {
      throw new Error(customerError.message);
    }

    customerId = customer.id;

    const { data: dog, error: dogError } = await supabase
      .from('dogs')
      .insert({
        ...rows.dog,
        customer_id: customer.id,
      })
      .select('id')
      .single();

    if (dogError) {
      throw new Error(dogError.message);
    }

    const { data: request, error: requestError } = await supabase
      .from('appointment_requests')
      .insert({
        ...rows.request,
        customer_id: customer.id,
        dog_id: dog.id,
      })
      .select('id, status, external_booking_url')
      .single();

    if (requestError) {
      throw new Error(requestError.message);
    }

    return {
      request,
      claimToken,
      customerEmail: customer.email,
    };
  } catch (error) {
    // TODO(backend): Once the write path is transactional, remove this best-effort
    // cleanup and record failed booking attempts for support/debugging.
    if (customerId) {
      await supabase.from('customers').delete().eq('id', customerId);
    }
    throw error;
  }
}

async function getUserForAccessToken(supabase, accessToken) {
  if (!accessToken) {
    throw userFacingError('Sign in before saving this guest booking.');
  }

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error) {
    throw new Error(error.message);
  }

  if (!data?.user?.id || !data.user.email) {
    throw userFacingError('Sign in before saving this guest booking.');
  }

  return data.user;
}

function unwrapJoinedRow(value) {
  return Array.isArray(value) ? value[0] : value;
}

export async function claimGuestBooking({ supabase, accessToken, claimToken, now = new Date() }) {
  // TODO(backend): Move claim/merge into a transaction that locks the request row
  // and handles duplicate dogs, existing customers, and repeated clicks safely.
  const user = await getUserForAccessToken(supabase, accessToken);
  const tokenHash = hashGuestClaimToken(cleanRequiredText(claimToken, 'Claim token is required.'));
  const { data: request, error: requestError } = await supabase
    .from('appointment_requests')
    .select(
      'id, customer_id, dog_id, guest_claim_expires_at, guest_claimed_at, customers(id, email, auth_user_id)',
    )
    .eq('guest_claim_token_hash', tokenHash)
    .single();

  if (requestError) {
    throw new Error(requestError.message);
  }

  if (request.guest_claimed_at) {
    return { claimed: true, requestId: request.id };
  }

  if (request.guest_claim_expires_at && new Date(request.guest_claim_expires_at) < now) {
    throw userFacingError('Guest booking claim link expired.');
  }

  const guestCustomer = unwrapJoinedRow(request.customers);
  if (!guestCustomer?.id) {
    throw userFacingError('We could not find this guest booking. Please try again or contact support.');
  }

  if (guestCustomer.email?.toLowerCase() !== user.email.toLowerCase()) {
    throw userFacingError('Sign in with the same email used for the guest booking.');
  }

  if (guestCustomer.auth_user_id && guestCustomer.auth_user_id !== user.id) {
    throw userFacingError('This guest booking is already linked to another account.');
  }

  const { data: existingCustomer, error: existingCustomerError } = await supabase
    .from('customers')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (existingCustomerError) {
    throw new Error(existingCustomerError.message);
  }

  if (existingCustomer?.id && existingCustomer.id !== guestCustomer.id) {
    const { error: dogError } = await supabase
      .from('dogs')
      .update({ customer_id: existingCustomer.id })
      .eq('id', request.dog_id);

    if (dogError) {
      throw new Error(dogError.message);
    }

    const { error: requestUpdateError } = await supabase
      .from('appointment_requests')
      .update({
        customer_id: existingCustomer.id,
        guest_claimed_at: now.toISOString(),
      })
      .eq('id', request.id);

    if (requestUpdateError) {
      throw new Error(requestUpdateError.message);
    }

    await supabase.from('customers').delete().eq('id', guestCustomer.id);
    // TODO(backend): Add an audit event so support can see when guest rows were
    // merged into an existing verified customer account.
    return { claimed: true, requestId: request.id };
  }

  if (!guestCustomer.auth_user_id) {
    const { error: customerUpdateError } = await supabase
      .from('customers')
      .update({ auth_user_id: user.id })
      .eq('id', guestCustomer.id);

    if (customerUpdateError) {
      throw new Error(customerUpdateError.message);
    }
  }

  const { error: requestClaimError } = await supabase
    .from('appointment_requests')
    .update({ guest_claimed_at: now.toISOString() })
    .eq('id', request.id);

  if (requestClaimError) {
    throw new Error(requestClaimError.message);
  }

  return { claimed: true, requestId: request.id };
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(body),
  };
}

export async function handleGuestBookingEvent(event, env = process.env) {
  // TODO(backend): Keep this as a thin Netlify adapter once apps/api exists;
  // business logic should live behind the proper backend boundary.
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  try {
    const result = await createGuestBooking({
      supabase: createServerSupabaseClient(env),
      input: JSON.parse(event.body || '{}'),
    });
    return jsonResponse(200, result);
  } catch (error) {
    const publicError = toPublicError(error);
    return jsonResponse(publicError.statusCode, publicError.body);
  }
}

export async function handleGuestBookingClaimEvent(event, env = process.env) {
  // TODO(backend): Require a CSRF/origin strategy before browser-authenticated
  // POST endpoints move beyond prototype/MVP traffic.
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  try {
    const accessToken = String(event.headers?.authorization || '')
      .replace(/^Bearer\s+/i, '')
      .trim();
    const result = await claimGuestBooking({
      supabase: createServerSupabaseClient(env),
      accessToken,
      claimToken: JSON.parse(event.body || '{}').claimToken,
    });
    return jsonResponse(200, result);
  } catch (error) {
    const publicError = toPublicError(error);
    return jsonResponse(publicError.statusCode, publicError.body);
  }
}
