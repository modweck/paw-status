// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { localDateString, wallClockToUtcIso } from './timezone.js';

describe('wallClockToUtcIso', () => {
  it('converts wall-clock time to UTC during EST (UTC-5) winter — America/New_York', () => {
    // 2026-01-15 09:00 EST → 2026-01-15 14:00 UTC
    expect(wallClockToUtcIso('2026-01-15', '09:00', 'America/New_York')).toBe(
      '2026-01-15T14:00:00.000Z',
    );
  });

  it('converts wall-clock time to UTC during EDT (UTC-4) summer — America/New_York', () => {
    // 2026-07-15 09:00 EDT → 2026-07-15 13:00 UTC
    expect(wallClockToUtcIso('2026-07-15', '09:00', 'America/New_York')).toBe(
      '2026-07-15T13:00:00.000Z',
    );
  });

  it('converts wall-clock time for America/Chicago (CST = UTC-6) in winter', () => {
    // 2026-01-15 10:00 CST → 2026-01-15 16:00 UTC
    expect(wallClockToUtcIso('2026-01-15', '10:00', 'America/Chicago')).toBe(
      '2026-01-15T16:00:00.000Z',
    );
  });

  it('converts wall-clock time for Europe/London (BST = UTC+1) in summer', () => {
    // 2026-07-15 09:00 BST → 2026-07-15 08:00 UTC
    expect(wallClockToUtcIso('2026-07-15', '09:00', 'Europe/London')).toBe(
      '2026-07-15T08:00:00.000Z',
    );
  });

  it('converts wall-clock time for Europe/London (GMT = UTC+0) in winter', () => {
    // 2026-01-15 09:00 GMT → 2026-01-15 09:00 UTC
    expect(wallClockToUtcIso('2026-01-15', '09:00', 'Europe/London')).toBe(
      '2026-01-15T09:00:00.000Z',
    );
  });
});

describe('localDateString', () => {
  it('returns YYYY-MM-DD for a date that is the same day in UTC and in New York', () => {
    // 2026-01-15T12:00:00Z → 07:00 EST on Jan 15 → still Jan 15
    expect(localDateString(new Date('2026-01-15T12:00:00Z'), 'America/New_York')).toBe(
      '2026-01-15',
    );
  });

  it('handles midnight rollover — UTC morning resolves to prior calendar day in New York', () => {
    // 2026-01-15T04:30:00Z = 23:30 EST on Jan 14 → "2026-01-14"
    expect(localDateString(new Date('2026-01-15T04:30:00Z'), 'America/New_York')).toBe(
      '2026-01-14',
    );
  });

  it('returns the correct date for a non-NY timezone', () => {
    // 2026-01-15T23:00:00Z = 2026-01-16T09:00+10:00 in Australia/Sydney (AEDT = UTC+11 in Jan)
    // Actually AEDT is UTC+11 in January. 23:00 UTC + 11h = 10:00 on Jan 16.
    expect(localDateString(new Date('2026-01-15T23:00:00Z'), 'Australia/Sydney')).toBe(
      '2026-01-16',
    );
  });
});
