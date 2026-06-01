import { HORIZON_DAYS, DEFAULT_LEAD_TIME_HOURS } from './constants.js';
import { wallClockToUtcIso, localDateString } from './timezone.js';

/**
 * Generate available booking slots for a groomer within the configured horizon.
 *
 * @param {object} groomerConfig
 * @param {string} groomerConfig.timezone - IANA timezone identifier
 * @param {number} [groomerConfig.lead_time_hours] - minimum hours before a slot starts;
 *   falls back to DEFAULT_LEAD_TIME_HOURS when absent
 * @param {Array<{day_of_week: number, open_time: string, close_time: string}>} groomerConfig.weekly_hours
 *   day_of_week follows JS convention: 0 = Sunday, 6 = Saturday
 * @param {Array<{service: string, duration_minutes: number}>} [groomerConfig.offerings]
 *   When non-empty, the first offering's duration_minutes drives slot length
 * @param {number} [groomerConfig.service_duration_minutes] - fallback slot duration
 * @param {Array<{start: Date|string, end: Date|string}>} existingBookings
 * @param {object} [options]
 * @param {Date|number} [options.now] - override for the current instant
 * @returns {Array<{start: Date, end: Date, iso: string}>}
 */
export function generateSlots(groomerConfig, existingBookings = [], options = {}) {
  const {
    timezone,
    weekly_hours = [],
    offerings,
    service_duration_minutes,
  } = groomerConfig;

  // Duration: first offering wins; fallback to service_duration_minutes.
  const durationMinutes =
    offerings && offerings.length > 0
      ? offerings[0].duration_minutes
      : service_duration_minutes;

  if (!durationMinutes || !weekly_hours.length) return [];

  const leadTimeHours = groomerConfig.lead_time_hours ?? DEFAULT_LEAD_TIME_HOURS;

  const nowMs =
    options.now instanceof Date
      ? options.now.getTime()
      : typeof options.now === 'number'
      ? options.now
      : Date.now();

  const earliestStartMs = nowMs + leadTimeHours * 60 * 60 * 1000;
  const horizonMs = nowMs + HORIZON_DAYS * 24 * 60 * 60 * 1000;
  const durationMs = durationMinutes * 60 * 1000;

  // O(1) day-of-week lookup.
  const hoursByDow = new Map(weekly_hours.map((h) => [h.day_of_week, h]));

  // Normalise existing bookings to millisecond timestamps for overlap checks.
  const normalizedBookings = existingBookings.map((b) => ({
    startMs: new Date(b.start).getTime(),
    endMs: new Date(b.end).getTime(),
  }));

  const slots = [];

  // Start iteration from the groomer's local calendar date at "now".
  let currentDateStr = localDateString(new Date(nowMs), timezone);

  for (let i = 0; i <= HORIZON_DAYS + 1; i++) {
    const [y, m, d] = currentDateStr.split('-').map(Number);

    // Derive day-of-week from the local calendar date (timezone-independent arithmetic).
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const hours = hoursByDow.get(dow);

    if (hours) {
      const openMs = new Date(
        wallClockToUtcIso(currentDateStr, hours.open_time, timezone),
      ).getTime();
      const closeMs = new Date(
        wallClockToUtcIso(currentDateStr, hours.close_time, timezone),
      ).getTime();

      // Skip the entire day when it starts beyond the horizon.
      if (openMs >= horizonMs) break;

      for (
        let slotMs = openMs;
        slotMs + durationMs <= closeMs;
        slotMs += durationMs
      ) {
        const slotEndMs = slotMs + durationMs;

        if (slotMs < earliestStartMs) continue;
        if (slotMs >= horizonMs) break;

        const hasOverlap = normalizedBookings.some(
          (b) => slotMs < b.endMs && slotEndMs > b.startMs,
        );

        if (!hasOverlap) {
          const start = new Date(slotMs);
          slots.push({ start, end: new Date(slotEndMs), iso: start.toISOString() });
        }
      }
    }

    // Advance by exactly one calendar day using date-component arithmetic.
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    const ny = next.getUTCFullYear();
    const nm = next.getUTCMonth() + 1;
    const nd = next.getUTCDate();
    currentDateStr = `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
  }

  return slots;
}
