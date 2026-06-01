/**
 * Converts a wall-clock date + time in a given IANA timezone to a UTC ISO-8601 string.
 *
 * Strategy: treat the wall-clock instant as if it were UTC (the "guess"), ask
 * Intl.DateTimeFormat what local time that UTC represents, measure the delta
 * between the desired local time and the returned local time, and shift the
 * guess by that delta.  This correctly handles both standard and daylight-saving
 * offsets without any external dependency.
 *
 * @param {string} dateStr - "YYYY-MM-DD"
 * @param {string} timeStr - "HH:MM" (24-hour clock)
 * @param {string} tz      - IANA timezone identifier, e.g. "America/New_York"
 * @returns {string}       UTC ISO-8601 string, e.g. "2026-01-15T14:00:00.000Z"
 */
export function wallClockToUtcIso(dateStr, timeStr, tz) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);

  // Step 1 — initial guess: pretend the wall-clock time is already UTC.
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));

  // Step 2 — find what local time that UTC instant represents in `tz`.
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(guess).map(({ type, value }) => [type, value]),
  );

  // Guard: some ICU builds return "24" instead of "00" for midnight.
  const localHour = Number(parts.hour) % 24;

  const guessLocalMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    localHour,
    Number(parts.minute),
  );

  // Step 3 — the "target" is the wall-clock time expressed as raw UTC millis.
  const targetMs = Date.UTC(year, month - 1, day, hour, minute);

  // Step 4 — shift the guess by the difference (= the UTC offset for this instant).
  return new Date(guess.getTime() + (targetMs - guessLocalMs)).toISOString();
}

/**
 * Returns the calendar date a `Date` object falls on in the given IANA timezone,
 * formatted as "YYYY-MM-DD".
 *
 * @param {Date}   date - any JS Date
 * @param {string} tz   - IANA timezone identifier, e.g. "America/New_York"
 * @returns {string}    "YYYY-MM-DD" in the given timezone
 */
export function localDateString(date, tz) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map(({ type, value }) => [type, value]),
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}
