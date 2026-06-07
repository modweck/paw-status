// Server-side next-available handler for groomer availability near a location.
//
// Queries groomers serving a geographic point, generates booking slots for each
// groomer over a configurable horizon, and returns the earliest available slots.
//
// Exports:
//   - computeNextAvailable({ supabase, lat, lng, radiusM, serviceId, topN = 10 })

import { generateSlots } from '../../api/src/booking/slots.js';

const NEXT_AVAIL_HORIZON_DAYS = 14;
const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * Find the next available booking slots across all groomers serving a location.
 *
 * @param {{ supabase: object, lat: number, lng: number, radiusM: number, serviceId: string, topN?: number }} params
 * @returns {Promise<Array<{ slotAt: Date, iso: string, groomer_id: string, groomer_name: string }>>}
 *   Array of top-N slots across all groomers, sorted by slotAt (earliest first).
 */
export async function computeNextAvailable({
  supabase,
  lat,
  lng,
  radiusM,
  serviceId,
  topN = 10,
}) {
  // Step 1: Query groomers serving this point
  const { data: groomers, error: groomersError } = await supabase.rpc('groomers_serving_point', {
    p_lat: lat,
    p_lng: lng,
    p_radius_m: radiusM,
    p_service_id: serviceId,
  });

  if (groomersError) {
    throw new Error(`Failed to fetch groomers: ${groomersError.message}`);
  }

  if (!groomers || groomers.length === 0) {
    return [];
  }

  // Step 2: For each groomer, fetch their schedule data and generate slots
  const allSlots = [];

  for (const groomer of groomers) {
    try {
      const [weeklyHoursResult, offeringsResult, appointmentsResult] = await Promise.all([
        supabase.from('groomer_weekly_hours').select('*').eq('groomer_id', groomer.groomer_id),
        supabase.from('groomer_offerings').select('*').eq('groomer_id', groomer.groomer_id),
        supabase.from('appointments').select('start, end').eq('groomer_id', groomer.groomer_id),
      ]);

      if (weeklyHoursResult.error) {
        // Log but don't throw — allow other groomers to contribute slots
        console.error(
          `Error fetching weekly hours for groomer ${groomer.groomer_id}:`,
          weeklyHoursResult.error,
        );
        continue;
      }

      if (offeringsResult.error) {
        console.error(
          `Error fetching offerings for groomer ${groomer.groomer_id}:`,
          offeringsResult.error,
        );
        continue;
      }

      if (appointmentsResult.error) {
        console.error(
          `Error fetching appointments for groomer ${groomer.groomer_id}:`,
          appointmentsResult.error,
        );
        continue;
      }

      const weekly_hours = weeklyHoursResult.data || [];

      // Skip groomers with no configured hours
      if (weekly_hours.length === 0) {
        continue;
      }

      const allOfferings = offeringsResult.data || [];
      const offerings = allOfferings.filter((o) => o.service === serviceId);

      // Generate slots for this groomer over the horizon window
      const slots = generateSlots(
        {
          timezone: DEFAULT_TIMEZONE,
          weekly_hours,
          offerings,
        },
        appointmentsResult.data || [],
        {
          // Override horizon for this query
          now: Date.now(),
        },
      );

      // Attach groomer metadata to each slot
      for (const slot of slots) {
        allSlots.push({
          slotAt: slot.start,
          iso: slot.iso,
          groomer_id: groomer.groomer_id,
          groomer_name: groomer.name,
        });
      }
    } catch (error) {
      // Log but don't throw — allow other groomers to contribute slots
      console.error(`Error processing groomer ${groomer.groomer_id}:`, error);
    }
  }

  // Step 3: Sort by earliest slot time and return top N
  allSlots.sort((a, b) => a.slotAt.getTime() - b.slotAt.getTime());
  return allSlots.slice(0, topN);
}
