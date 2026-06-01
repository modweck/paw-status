// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { generateSlots } from './slots.js';

// All tests use America/New_York in January → EST = UTC-5.
// Wall-clock to UTC: add 5 hours.
//
// Key dates (2026-01-xx, verified via day-of-week arithmetic):
//   2026-01-01 = Thursday
//   2026-01-18 = Sunday  (0)
//   2026-01-19 = Monday  (1)
//   2026-01-20 = Tuesday (2)
//   2026-01-21 = Wednesday (3)

const TZ = 'America/New_York';

describe('generateSlots', () => {
  it('returns [] when weekly_hours is empty', () => {
    const config = {
      timezone: TZ,
      lead_time_hours: 0,
      service_duration_minutes: 60,
      weekly_hours: [],
    };

    expect(generateSlots(config, [], { now: new Date('2026-01-19T14:00:00Z') })).toEqual([]);
  });

  it('returns [] when no duration is available', () => {
    const config = {
      timezone: TZ,
      lead_time_hours: 0,
      weekly_hours: [{ day_of_week: 1, open_time: '09:00', close_time: '17:00' }],
    };

    expect(generateSlots(config, [], { now: new Date('2026-01-18T00:00:00Z') })).toEqual([]);
  });

  it('enforces lead time — no slot before now + lead_time_hours', () => {
    // now = 2026-01-19T15:00:00Z → 10:00 AM EST (Monday)
    // lead = 2 h → earliest = 12:00 PM EST = 17:00 UTC
    // open 09:00–17:00 EST, 60-min slots → first eligible slot = 12:00 PM EST
    const now = new Date('2026-01-19T15:00:00Z');
    const config = {
      timezone: TZ,
      lead_time_hours: 2,
      service_duration_minutes: 60,
      weekly_hours: [{ day_of_week: 1, open_time: '09:00', close_time: '17:00' }],
    };

    const slots = generateSlots(config, [], { now });

    expect(slots.length).toBeGreaterThan(0);
    // First slot on Jan 19 must be 12:00 PM EST = 17:00 UTC.
    expect(slots[0].iso).toBe('2026-01-19T17:00:00.000Z');
    // Every slot must be at or after the earliest allowed start.
    const earliestMs = now.getTime() + 2 * 60 * 60 * 1000;
    for (const slot of slots) {
      expect(slot.start.getTime()).toBeGreaterThanOrEqual(earliestMs);
    }
  });

  it('uses DEFAULT_LEAD_TIME_HOURS when lead_time_hours is absent', () => {
    // DEFAULT_LEAD_TIME_HOURS = 2.
    // now = 2026-01-19T14:00:00Z → 09:00 AM EST; earliest = 11:00 AM = 16:00 UTC.
    // open 09:00–13:00 EST, 60-min slots: 09:00, 10:00, 11:00, 12:00.
    // Slots >= 11:00 AM EST (16:00 UTC): 11:00 and 12:00.
    const now = new Date('2026-01-19T14:00:00Z');
    const config = {
      timezone: TZ,
      service_duration_minutes: 60,
      weekly_hours: [{ day_of_week: 1, open_time: '09:00', close_time: '13:00' }],
    };

    const slots = generateSlots(config, [], { now });

    const todaySlots = slots.filter((s) => s.iso.startsWith('2026-01-19'));
    expect(todaySlots.map((s) => s.iso)).toEqual([
      '2026-01-19T16:00:00.000Z', // 11:00 AM EST
      '2026-01-19T17:00:00.000Z', // 12:00 PM EST
    ]);
  });

  it('respects open_time and close_time — slots stay within business hours', () => {
    // now well before the day in question so lead time is irrelevant.
    // Sunday Jan 18: open 10:00–14:00 EST, 60-min slots.
    // Expected: 10:00, 11:00, 12:00, 13:00 EST → 15:00, 16:00, 17:00, 18:00 UTC.
    const now = new Date('2026-01-17T00:00:00Z'); // Saturday midnight UTC
    const config = {
      timezone: TZ,
      lead_time_hours: 0,
      service_duration_minutes: 60,
      weekly_hours: [{ day_of_week: 0, open_time: '10:00', close_time: '14:00' }],
    };

    const slots = generateSlots(config, [], { now });
    const daySlots = slots.filter((s) => s.iso.startsWith('2026-01-18'));

    expect(daySlots.map((s) => s.iso)).toEqual([
      '2026-01-18T15:00:00.000Z', // 10:00 EST
      '2026-01-18T16:00:00.000Z', // 11:00 EST
      '2026-01-18T17:00:00.000Z', // 12:00 EST
      '2026-01-18T18:00:00.000Z', // 13:00 EST
    ]);

    // Verify start/end shape
    expect(daySlots[0].start).toBeInstanceOf(Date);
    expect(daySlots[0].end).toBeInstanceOf(Date);
    expect(daySlots[0].end.getTime() - daySlots[0].start.getTime()).toBe(60 * 60 * 1000);
  });

  it('excludes slots that overlap with any existing booking', () => {
    // Monday Jan 19: open 09:00–12:00 EST, 60-min slots → 09:00, 10:00, 11:00 EST.
    // Booking covers 10:00–11:00 EST (15:00–16:00 UTC) → only 09:00 and 11:00 remain.
    const now = new Date('2026-01-18T00:00:00Z');
    const existingBookings = [
      {
        start: new Date('2026-01-19T15:00:00Z'), // 10:00 AM EST
        end: new Date('2026-01-19T16:00:00Z'),   // 11:00 AM EST
      },
    ];
    const config = {
      timezone: TZ,
      lead_time_hours: 0,
      service_duration_minutes: 60,
      weekly_hours: [{ day_of_week: 1, open_time: '09:00', close_time: '12:00' }],
    };

    const slots = generateSlots(config, existingBookings, { now });
    const mondaySlots = slots.filter((s) => s.iso.startsWith('2026-01-19'));

    expect(mondaySlots.map((s) => s.iso)).toEqual([
      '2026-01-19T14:00:00.000Z', // 09:00 EST — before booking
      '2026-01-19T16:00:00.000Z', // 11:00 EST — after booking
    ]);
  });

  it('also excludes slots partially overlapping with a booking', () => {
    // Monday Jan 19: open 09:00–12:00 EST, 60-min slots: 09:00, 10:00, 11:00.
    // Booking 09:30–10:30 EST (14:30–15:30 UTC) overlaps both 09:00 and 10:00 slots.
    const now = new Date('2026-01-18T00:00:00Z');
    const existingBookings = [
      {
        start: new Date('2026-01-19T14:30:00Z'), // 09:30 AM EST
        end: new Date('2026-01-19T15:30:00Z'),   // 10:30 AM EST
      },
    ];
    const config = {
      timezone: TZ,
      lead_time_hours: 0,
      service_duration_minutes: 60,
      weekly_hours: [{ day_of_week: 1, open_time: '09:00', close_time: '12:00' }],
    };

    const slots = generateSlots(config, existingBookings, { now });
    const mondaySlots = slots.filter((s) => s.iso.startsWith('2026-01-19'));

    // 09:00 overlaps (14:00–15:00 touches 14:30 booking end) → excluded
    // 10:00 overlaps (15:00–16:00 touches 14:30 booking end) → excluded
    // 11:00 = 16:00–17:00 UTC → no overlap → included
    expect(mondaySlots.map((s) => s.iso)).toEqual([
      '2026-01-19T16:00:00.000Z', // 11:00 EST
    ]);
  });

  it('produces correct slot sequence across multiple days', () => {
    // now = Monday Jan 19 10:00 AM EST, lead = 0.
    // Tuesday Jan 20: open 10:00–12:00 EST → slots: 10:00, 11:00 EST.
    // Wednesday Jan 21: open 14:00–16:00 EST → slots: 14:00, 15:00 EST.
    const now = new Date('2026-01-19T15:00:00Z'); // 10:00 AM EST
    const config = {
      timezone: TZ,
      lead_time_hours: 0,
      service_duration_minutes: 60,
      weekly_hours: [
        { day_of_week: 2, open_time: '10:00', close_time: '12:00' }, // Tuesday
        { day_of_week: 3, open_time: '14:00', close_time: '16:00' }, // Wednesday
      ],
    };

    const slots = generateSlots(config, [], { now });

    const tueSlots = slots.filter((s) => s.iso.startsWith('2026-01-20'));
    const wedSlots = slots.filter((s) => s.iso.startsWith('2026-01-21'));

    expect(tueSlots.map((s) => s.iso)).toEqual([
      '2026-01-20T15:00:00.000Z', // 10:00 EST
      '2026-01-20T16:00:00.000Z', // 11:00 EST
    ]);
    expect(wedSlots.map((s) => s.iso)).toEqual([
      '2026-01-21T19:00:00.000Z', // 14:00 EST
      '2026-01-21T20:00:00.000Z', // 15:00 EST
    ]);

    // Both days appear in the result in chronological order.
    const tueMins = tueSlots.map((s) => s.start.getTime());
    const wedMins = wedSlots.map((s) => s.start.getTime());
    expect(Math.max(...tueMins)).toBeLessThan(Math.min(...wedMins));
  });

  it('applies per-offering duration_minutes when offerings rows are provided', () => {
    // offering duration = 90 min, fallback service_duration_minutes = 60 (must be ignored).
    // Monday Jan 19: open 09:00–12:00 EST (3 h window).
    // 90-min slots: 09:00 and 10:30 EST fit; 12:00 does not (12:00 + 90 = 13:30 > 12:00).
    const now = new Date('2026-01-18T00:00:00Z');
    const config = {
      timezone: TZ,
      lead_time_hours: 0,
      service_duration_minutes: 60,
      offerings: [{ service: 'bath-and-groom', duration_minutes: 90 }],
      weekly_hours: [{ day_of_week: 1, open_time: '09:00', close_time: '12:00' }],
    };

    const slots = generateSlots(config, [], { now });
    const mondaySlots = slots.filter((s) => s.iso.startsWith('2026-01-19'));

    expect(mondaySlots.map((s) => s.iso)).toEqual([
      '2026-01-19T14:00:00.000Z', // 09:00 EST
      '2026-01-19T15:30:00.000Z', // 10:30 EST
    ]);
    // Each slot is exactly 90 minutes.
    for (const slot of mondaySlots) {
      expect(slot.end.getTime() - slot.start.getTime()).toBe(90 * 60 * 1000);
    }
  });

  it('accepts options.now as a numeric timestamp', () => {
    const nowMs = new Date('2026-01-18T00:00:00Z').getTime();
    const config = {
      timezone: TZ,
      lead_time_hours: 0,
      service_duration_minutes: 60,
      weekly_hours: [{ day_of_week: 0, open_time: '10:00', close_time: '11:00' }],
    };

    const slots = generateSlots(config, [], { now: nowMs });
    expect(slots.length).toBeGreaterThan(0);
  });

  it('returns Date instances for start and end with a matching iso string', () => {
    const now = new Date('2026-01-18T00:00:00Z');
    const config = {
      timezone: TZ,
      lead_time_hours: 0,
      service_duration_minutes: 60,
      weekly_hours: [{ day_of_week: 0, open_time: '10:00', close_time: '11:00' }],
    };

    const slots = generateSlots(config, [], { now });
    const s = slots[0];

    expect(s.start).toBeInstanceOf(Date);
    expect(s.end).toBeInstanceOf(Date);
    expect(s.iso).toBe(s.start.toISOString());
  });
});
