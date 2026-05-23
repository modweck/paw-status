// Provider confirmation placeholder.
// External booking links are currently handoffs; they are not confirmation.

export const BOOKING_PROVIDER_CONFIRMATION_TODOS = Object.freeze([
  'Square: OAuth seller connection, booking create/read flow, and webhook confirmation.',
  'Calendly: event type mapping, invitee webhook handling, and appointment_request reconciliation.',
  'Acuity: appointment webhook/API confirmation and cancellation reconciliation.',
  'Google Calendar: freebusy lookup, optional calendar hold, and event sync where appropriate.',
  'Google Business Profile: action-link discovery only unless a supported booking API exists.',
  'Provider-agnostic idempotency keys and external reference ids on appointment_requests/appointments.',
]);

export async function handleProviderBookingConfirmation(_context = {}, _input = {}) {
  // TODO(integrations): Verify provider webhook signatures, map external booking
  // ids to PawStatus requests, and confirm appointments only after a trusted
  // provider event/API response.
  throw new Error('handleProviderBookingConfirmation is not implemented yet.');
}

export async function reconcileProviderBookingState(_context = {}, _input = {}) {
  // TODO(integrations): Add scheduled/manual reconciliation so external booking
  // state cannot drift from PawStatus appointment state indefinitely.
  throw new Error('reconcileProviderBookingState is not implemented yet.');
}
