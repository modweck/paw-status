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

export const jsonHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};

function cleanOptionalText(value) {
  const cleaned = String(value || '').trim();
  return cleaned || null;
}

function cleanRequiredText(value, message) {
  const cleaned = cleanOptionalText(value);
  if (!cleaned) {
    throw new Error(message);
  }

  return cleaned;
}

function cleanEmail(value) {
  const cleaned = cleanRequiredText(value, 'Email is required.').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    throw new Error('Enter a valid email.');
  }

  return cleaned;
}

function cleanDogSize(value) {
  const cleaned = cleanRequiredText(value, 'Choose a dog size.').toLowerCase();
  if (!DOG_SIZE_VALUES.has(cleaned)) {
    throw new Error('Choose a valid dog size.');
  }

  return cleaned;
}

function cleanDate(value, message) {
  const cleaned = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    throw new Error(message);
  }

  return cleaned;
}

function cleanTimeOfDay(value) {
  const cleaned = String(value || '').trim();
  if (!TIME_OF_DAY_VALUES.has(cleaned)) {
    throw new Error('Choose a valid time of day.');
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

  return {
    type: window.type,
    date: cleanDate(
      window.date,
      window.type === 'backup-date'
        ? 'Choose a valid backup date.'
        : 'Choose a valid preferred date.',
    ),
    timeOfDay: cleanTimeOfDay(window.timeOfDay),
  };
}

function cleanPreferredWindows(windows = []) {
  const normalized = windows.map(cleanPreferredWindow).filter(Boolean);

  if (!normalized.length) {
    throw new Error('Choose first available or a preferred date.');
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
    throw new Error('Choose a groomer before requesting a booking.');
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
  const statusCode =
    /required|valid|choose|expired|match|sign in/i.test(error.message) ? 400 : 500;

  return {
    statusCode,
    body: { error: error.message || 'Guest booking request failed.' },
  };
}

async function fetchGroomer(supabase, groomerId) {
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
  const claimToken = createGuestClaimToken();
  const groomer = await fetchGroomer(supabase, input.groomerId);
  const rows = buildGuestBookingRows(input, { claimToken, groomer, now });
  let customerId = '';

  try {
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
    if (customerId) {
      await supabase.from('customers').delete().eq('id', customerId);
    }
    throw error;
  }
}

async function getUserForAccessToken(supabase, accessToken) {
  if (!accessToken) {
    throw new Error('Sign in before saving this guest booking.');
  }

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error) {
    throw new Error(error.message);
  }

  if (!data?.user?.id || !data.user.email) {
    throw new Error('Sign in before saving this guest booking.');
  }

  return data.user;
}

function unwrapJoinedRow(value) {
  return Array.isArray(value) ? value[0] : value;
}

export async function claimGuestBooking({ supabase, accessToken, claimToken, now = new Date() }) {
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
    throw new Error('Guest booking claim link expired.');
  }

  const guestCustomer = unwrapJoinedRow(request.customers);
  if (!guestCustomer?.id) {
    throw new Error('Guest customer row not found.');
  }

  if (guestCustomer.email?.toLowerCase() !== user.email.toLowerCase()) {
    throw new Error('Sign in with the same email used for the guest booking.');
  }

  if (guestCustomer.auth_user_id && guestCustomer.auth_user_id !== user.id) {
    throw new Error('This guest booking is already linked to another account.');
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
