import { handleGuestBookingEvent } from '../../server/guestBooking.js';

export async function handler(event) {
  // TODO(backend): Replace this Netlify function with an apps/api route once the
  // proper backend owns booking requests, auth, rate limits, and audit logging.
  return handleGuestBookingEvent(event, process.env);
}
