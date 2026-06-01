// Server-side availability handler for groomer booking slots.
//
// Loads the groomer's schedule tables from Supabase using the service-role key,
// then delegates slot generation to the shared booking engine.
//
// Two exports:
//   - handleAvailabilityRequest({ groomerId, serviceId, timezone }, env)
//   - toPublicAvailabilityError(error)

import { createClient } from '@supabase/supabase-js';
import { generateSlots } from '../../api/src/booking/slots.js';

const DEFAULT_TIMEZONE = 'America/New_York';

function createServerSupabase(env) {
  const url = env?.SUPABASE_URL || env?.VITE_SUPABASE_URL;
  const key = env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error('Server Supabase environment is missing.');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Load groomer schedule data from Supabase and return available booking slots.
 *
 * @param {{ groomerId: string, serviceId?: string, timezone?: string }} params
 * @param {object} env - server environment (must contain SUPABASE_URL + service-role key)
 * @returns {Promise<{ slots: Array<{ start: Date, end: Date, iso: string }> }>}
 */
export async function handleAvailabilityRequest(
  { groomerId, serviceId, timezone } = {},
  env,
) {
  const supabase = createServerSupabase(env);
  const tz = timezone || DEFAULT_TIMEZONE;

  const [weeklyHoursResult, offeringsResult, timeOffResult, appointmentsResult] =
    await Promise.all([
      supabase.from('groomer_weekly_hours').select('*').eq('groomer_id', groomerId),
      supabase.from('groomer_offerings').select('*').eq('groomer_id', groomerId),
      supabase.from('groomer_time_off').select('*').eq('groomer_id', groomerId),
      supabase.from('appointments').select('start, end').eq('groomer_id', groomerId),
    ]);

  if (weeklyHoursResult.error) throw new Error(weeklyHoursResult.error.message);
  if (offeringsResult.error) throw new Error(offeringsResult.error.message);
  if (timeOffResult.error) throw new Error(timeOffResult.error.message);
  if (appointmentsResult.error) throw new Error(appointmentsResult.error.message);

  const weekly_hours = weeklyHoursResult.data || [];

  // Unknown or unconfigured groomer — no schedule rows present.
  if (weekly_hours.length === 0) {
    return { slots: [] };
  }

  const allOfferings = offeringsResult.data || [];
  const offerings = serviceId
    ? allOfferings.filter((o) => o.service === serviceId)
    : allOfferings;

  const slots = generateSlots(
    { timezone: tz, weekly_hours, offerings },
    appointmentsResult.data || [],
  );

  return { slots };
}

/**
 * Convert an internal availability error into a safe public response shape.
 *
 * Follows the same `{ statusCode, body }` convention as toPublicGooglePlacesError.
 *
 * @param {unknown} error
 * @returns {{ statusCode: number, body: { error: string } }}
 */
export function toPublicAvailabilityError(error) {
  return {
    statusCode: 500,
    body: {
      error: (error && error.message) || 'Availability check failed.',
    },
  };
}
