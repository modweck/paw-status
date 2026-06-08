// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createSquareAdapter } from './square.js';

describe('Square Adapter', () => {
  it('returns an adapter with pushBooking and syncAvailability methods', () => {
    const adapter = createSquareAdapter();

    expect(adapter).toHaveProperty('pushBooking');
    expect(adapter).toHaveProperty('syncAvailability');
    expect(typeof adapter.pushBooking).toBe('function');
    expect(typeof adapter.syncAvailability).toBe('function');
  });

  it('pushBooking returns a ref with sq_demo_ prefix and appointment id', () => {
    const adapter = createSquareAdapter();
    const appointment = {
      id: 'apt-123',
      customerId: 'cust-456',
    };

    const result = adapter.pushBooking(appointment);

    expect(result).toEqual({
      ref: 'sq_demo_apt-123',
    });
  });

  it('pushBooking works with different appointment ids', () => {
    const adapter = createSquareAdapter();

    expect(adapter.pushBooking({ id: 'apt-1' })).toEqual({ ref: 'sq_demo_apt-1' });
    expect(adapter.pushBooking({ id: 'appointment-xyz' })).toEqual({
      ref: 'sq_demo_appointment-xyz',
    });
    expect(adapter.pushBooking({ id: 'booking-999' })).toEqual({
      ref: 'sq_demo_booking-999',
    });
  });

  it('syncAvailability returns synced true', () => {
    const adapter = createSquareAdapter();

    const result = adapter.syncAvailability();

    expect(result).toEqual({
      synced: true,
    });
  });

  it('syncAvailability returns the same result on multiple calls', () => {
    const adapter = createSquareAdapter();

    const result1 = adapter.syncAvailability();
    const result2 = adapter.syncAvailability();

    expect(result1).toEqual(result2);
    expect(result1).toEqual({ synced: true });
  });
});
