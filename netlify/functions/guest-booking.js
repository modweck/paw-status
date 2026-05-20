import { handleGuestBookingEvent } from '../../server/guestBooking.js';

export async function handler(event) {
  return handleGuestBookingEvent(event, process.env);
}
