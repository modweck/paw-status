import { describe, expect, it } from 'vitest';

import {
  formatAppointmentRequestStatus,
  formatCalendarConnectionStatus,
  formatGroomerMembershipStatus,
} from './statusLabels.js';

describe('formatAppointmentRequestStatus', () => {
  it('maps every known appointment_requests.status value to readable copy', () => {
    expect(formatAppointmentRequestStatus('requested')).toBe('New request');
    expect(formatAppointmentRequestStatus('viewed')).toBe('Viewed');
    expect(formatAppointmentRequestStatus('needs_customer_action')).toBe('Waiting on customer');
    expect(formatAppointmentRequestStatus('external_handoff')).toBe('Sent booking link');
    expect(formatAppointmentRequestStatus('confirmed')).toBe('Confirmed');
    expect(formatAppointmentRequestStatus('declined')).toBe('Declined');
    expect(formatAppointmentRequestStatus('expired')).toBe('Expired');
  });

  it('falls back to a prettified label for unknown values', () => {
    expect(formatAppointmentRequestStatus('some_new_state')).toBe('Some New State');
  });

  it('returns Unknown for missing or empty input', () => {
    expect(formatAppointmentRequestStatus('')).toBe('Unknown');
    expect(formatAppointmentRequestStatus(undefined)).toBe('Unknown');
    expect(formatAppointmentRequestStatus(null)).toBe('Unknown');
  });
});

describe('formatGroomerMembershipStatus', () => {
  it('maps every membership status to readable copy', () => {
    expect(formatGroomerMembershipStatus('pending')).toBe('Pending review');
    expect(formatGroomerMembershipStatus('verified')).toBe('Verified');
    expect(formatGroomerMembershipStatus('rejected')).toBe('Rejected');
  });

  it('falls back to a prettified label for unknown values', () => {
    expect(formatGroomerMembershipStatus('on_hold')).toBe('On Hold');
  });
});

describe('formatCalendarConnectionStatus', () => {
  it('maps every connection status to readable copy', () => {
    expect(formatCalendarConnectionStatus('not_connected')).toBe('Not connected');
    expect(formatCalendarConnectionStatus('pending')).toBe('Connecting');
    expect(formatCalendarConnectionStatus('connected')).toBe('Connected');
    expect(formatCalendarConnectionStatus('error')).toBe('Connection error');
    expect(formatCalendarConnectionStatus('revoked')).toBe('Revoked');
  });

  it('falls back to a prettified label for unknown values', () => {
    expect(formatCalendarConnectionStatus('needs_review')).toBe('Needs Review');
  });
});
