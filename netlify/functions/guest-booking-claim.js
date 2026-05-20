import { handleGuestBookingClaimEvent } from '../../server/guestBooking.js';

export async function handler(event) {
  return handleGuestBookingClaimEvent(event, process.env);
}
