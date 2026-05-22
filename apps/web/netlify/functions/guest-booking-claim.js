import { handleGuestBookingClaimEvent } from '../../server/guestBooking.js';

export async function handler(event) {
  // TODO(backend): Replace this Netlify function with an apps/api route that
  // verifies sessions, locks rows, and records guest-claim audit events.
  return handleGuestBookingClaimEvent(event, process.env);
}
