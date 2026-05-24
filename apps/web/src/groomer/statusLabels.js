// Human-readable labels for the three status enums groomers see in their
// dashboard. Keeping them in one file makes it cheap to keep copy consistent
// and gives us a single seam to translate later.

const APPOINTMENT_REQUEST_STATUS_LABELS = Object.freeze({
  requested: 'New request',
  viewed: 'Viewed',
  needs_customer_action: 'Waiting on customer',
  external_handoff: 'Sent booking link',
  confirmed: 'Confirmed',
  declined: 'Declined',
  expired: 'Expired',
});

const GROOMER_MEMBERSHIP_STATUS_LABELS = Object.freeze({
  pending: 'Pending review',
  verified: 'Verified',
  rejected: 'Rejected',
});

const CALENDAR_CONNECTION_STATUS_LABELS = Object.freeze({
  not_connected: 'Not connected',
  pending: 'Connecting',
  connected: 'Connected',
  error: 'Connection error',
  revoked: 'Revoked',
});

function prettify(rawValue) {
  const cleaned = String(rawValue || '').trim();
  if (!cleaned) return 'Unknown';
  return cleaned
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function warnOnUnknownStatus(label, status, knownMap) {
  // Only log in dev so customers never see warnings and tests stay quiet.
  // Helps catch typos and new enum values that forgot to update copy.
  const nodeEnv =
    (typeof process !== 'undefined' && process.env?.NODE_ENV) || '';
  if (nodeEnv === 'production' || nodeEnv === 'test') return;
  if (status && !Object.prototype.hasOwnProperty.call(knownMap, status)) {
    // eslint-disable-next-line no-console
    console.warn(`[statusLabels] unknown ${label}: ${JSON.stringify(status)}`);
  }
}

/**
 * Maps an appointment_requests.status enum value to readable copy.
 * AUDIENCE: groomer dashboard only. The "Waiting on customer" label reads
 * as accusatory if reused customer-side; build a customer-specific map
 * before exposing this in a customer view.
 */
export function formatAppointmentRequestStatus(status) {
  warnOnUnknownStatus('appointment_request status', status, APPOINTMENT_REQUEST_STATUS_LABELS);
  return APPOINTMENT_REQUEST_STATUS_LABELS[status] || prettify(status);
}

/**
 * Maps a groomer_memberships.status enum value to readable copy.
 * AUDIENCE: groomer dashboard. Safe to reuse on the admin verification page.
 */
export function formatGroomerMembershipStatus(status) {
  warnOnUnknownStatus('groomer_membership status', status, GROOMER_MEMBERSHIP_STATUS_LABELS);
  return GROOMER_MEMBERSHIP_STATUS_LABELS[status] || prettify(status);
}

/**
 * Maps a calendar_connections.status enum value to readable copy.
 * AUDIENCE: groomer dashboard.
 */
export function formatCalendarConnectionStatus(status) {
  warnOnUnknownStatus('calendar_connection status', status, CALENDAR_CONNECTION_STATUS_LABELS);
  return CALENDAR_CONNECTION_STATUS_LABELS[status] || prettify(status);
}
