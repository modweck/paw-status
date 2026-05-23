// Confirmed booking model placeholder.
// Current customer flows create appointment_requests, not confirmed appointments.

export const REAL_BOOKING_TODOS = Object.freeze([
  'Move service catalog, duration, price, size modifiers, and breed modifiers into database-backed tables.',
  'Model groomer/salon business hours, staff hours, buffers, blocked time, and travel/service-area rules.',
  'Compute available slots server-side from trusted calendar and appointment data.',
  'Prevent double booking with a transaction, exclusion constraint, or locked slot reservation RPC.',
  'Create confirmed appointments only after groomer/admin confirmation or provider webhook/API confirmation.',
  'Support canceling and rescheduling with product rules and audit events.',
]);

export async function computeAvailableSlots(_context = {}, _input = {}) {
  // TODO(booking): Implement server-side slot calculation before the UI offers
  // actual appointment times. Do not calculate availability only in the browser.
  throw new Error('computeAvailableSlots is not implemented yet.');
}

export async function createConfirmedAppointment(_context = {}, _input = {}) {
  // TODO(booking): Implement confirmed appointment creation after availability,
  // double-booking prevention, customer ownership, groomer ownership, and
  // provider confirmation rules exist.
  throw new Error('createConfirmedAppointment is not implemented yet.');
}
