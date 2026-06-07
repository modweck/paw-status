import { describe, expect, it } from 'vitest';

import {
  isValid,
  validateAvailability,
  validateBusiness,
  validateLocation,
  validateServices,
} from './validation.js';

describe('validateBusiness', () => {
  it('returns empty errors for valid business data', () => {
    const step = {
      name: 'Happy Paws Grooming',
      salon: 'Downtown Location',
    };
    expect(validateBusiness(step)).toEqual({});
  });

  it('returns error when name is missing', () => {
    const step = {
      salon: 'Downtown Location',
    };
    expect(validateBusiness(step)).toHaveProperty('name');
  });

  it('returns error when name is empty string', () => {
    const step = {
      name: '',
      salon: 'Downtown Location',
    };
    expect(validateBusiness(step)).toHaveProperty('name');
  });

  it('returns error when name is whitespace only', () => {
    const step = {
      name: '   ',
      salon: 'Downtown Location',
    };
    expect(validateBusiness(step)).toHaveProperty('name');
  });

  it('returns error when salon is missing', () => {
    const step = {
      name: 'Happy Paws Grooming',
    };
    expect(validateBusiness(step)).toHaveProperty('salon');
  });

  it('returns error when salon is empty string', () => {
    const step = {
      name: 'Happy Paws Grooming',
      salon: '',
    };
    expect(validateBusiness(step)).toHaveProperty('salon');
  });

  it('returns error when salon is whitespace only', () => {
    const step = {
      name: 'Happy Paws Grooming',
      salon: '   ',
    };
    expect(validateBusiness(step)).toHaveProperty('salon');
  });

  it('returns errors for both missing fields', () => {
    const step = {};
    const errors = validateBusiness(step);
    expect(errors).toHaveProperty('name');
    expect(errors).toHaveProperty('salon');
  });

  it('accepts name and salon with special characters', () => {
    const step = {
      name: "Pawsitively Perfect's Grooming & Spa",
      salon: 'Suite 100-B',
    };
    expect(validateBusiness(step)).toEqual({});
  });
});

describe('validateLocation', () => {
  it('returns empty errors for valid location with lat/lng', () => {
    const step = {
      address: '123 Main St, City, State 12345',
      lat: 40.7128,
      lng: -74.006,
    };
    expect(validateLocation(step)).toEqual({});
  });

  it('returns empty errors for valid location with placeId', () => {
    const step = {
      address: '123 Main St, City, State 12345',
      placeId: 'ChIJYVZ8wP4LkIARhXDrNAASEWM',
    };
    expect(validateLocation(step)).toEqual({});
  });

  it('returns empty errors when both lat/lng and placeId are provided', () => {
    const step = {
      address: '123 Main St, City, State 12345',
      lat: 40.7128,
      lng: -74.006,
      placeId: 'ChIJYVZ8wP4LkIARhXDrNAASEWM',
    };
    expect(validateLocation(step)).toEqual({});
  });

  it('returns error when address is missing', () => {
    const step = {
      lat: 40.7128,
      lng: -74.006,
    };
    expect(validateLocation(step)).toHaveProperty('address');
  });

  it('returns error when address is empty string', () => {
    const step = {
      address: '',
      lat: 40.7128,
      lng: -74.006,
    };
    expect(validateLocation(step)).toHaveProperty('address');
  });

  it('returns error when address is whitespace only', () => {
    const step = {
      address: '   ',
      lat: 40.7128,
      lng: -74.006,
    };
    expect(validateLocation(step)).toHaveProperty('address');
  });

  it('returns error when neither lat/lng nor placeId provided', () => {
    const step = {
      address: '123 Main St, City, State 12345',
    };
    expect(validateLocation(step)).toHaveProperty('location');
  });

  it('returns error when lat is missing but lng is present', () => {
    const step = {
      address: '123 Main St, City, State 12345',
      lng: -74.006,
    };
    expect(validateLocation(step)).toHaveProperty('location');
  });

  it('returns error when lng is missing but lat is present', () => {
    const step = {
      address: '123 Main St, City, State 12345',
      lat: 40.7128,
    };
    expect(validateLocation(step)).toHaveProperty('location');
  });

  it('returns error when lat is not a number', () => {
    const step = {
      address: '123 Main St, City, State 12345',
      lat: '40.7128',
      lng: -74.006,
    };
    expect(validateLocation(step)).toHaveProperty('location');
  });

  it('returns error when lng is not a number', () => {
    const step = {
      address: '123 Main St, City, State 12345',
      lat: 40.7128,
      lng: '-74.006',
    };
    expect(validateLocation(step)).toHaveProperty('location');
  });

  it('returns error when placeId is empty string', () => {
    const step = {
      address: '123 Main St, City, State 12345',
      placeId: '',
    };
    expect(validateLocation(step)).toHaveProperty('location');
  });

  it('returns errors for missing address and coordinates', () => {
    const step = {};
    const errors = validateLocation(step);
    expect(errors).toHaveProperty('address');
    expect(errors).toHaveProperty('location');
  });
});

describe('validateServices', () => {
  it('returns empty errors for valid single service', () => {
    const step = {
      offerings: [
        {
          service: 'Full Groom',
          durationMinutes: 120,
          basePriceCents: 10000,
        },
      ],
    };
    expect(validateServices(step)).toEqual({});
  });

  it('returns empty errors for multiple valid services', () => {
    const step = {
      offerings: [
        {
          service: 'Full Groom',
          durationMinutes: 120,
          basePriceCents: 10000,
        },
        {
          service: 'Bath Only',
          durationMinutes: 45,
          basePriceCents: 5000,
        },
      ],
    };
    expect(validateServices(step)).toEqual({});
  });

  it('returns error when offerings array is missing', () => {
    const step = {};
    const errors = validateServices(step);
    expect(errors).toHaveProperty('offerings');
  });

  it('returns error when offerings array is empty', () => {
    const step = {
      offerings: [],
    };
    const errors = validateServices(step);
    expect(errors).toHaveProperty('offerings');
  });

  it('returns error when offering service is missing', () => {
    const step = {
      offerings: [
        {
          durationMinutes: 120,
          basePriceCents: 10000,
        },
      ],
    };
    const errors = validateServices(step);
    expect(Array.isArray(errors.offerings)).toBe(true);
    expect(errors.offerings[0].errors).toHaveProperty('service');
  });

  it('returns error when offering service is empty string', () => {
    const step = {
      offerings: [
        {
          service: '',
          durationMinutes: 120,
          basePriceCents: 10000,
        },
      ],
    };
    const errors = validateServices(step);
    expect(Array.isArray(errors.offerings)).toBe(true);
    expect(errors.offerings[0].errors).toHaveProperty('service');
  });

  it('returns error when offering service is whitespace only', () => {
    const step = {
      offerings: [
        {
          service: '   ',
          durationMinutes: 120,
          basePriceCents: 10000,
        },
      ],
    };
    const errors = validateServices(step);
    expect(Array.isArray(errors.offerings)).toBe(true);
    expect(errors.offerings[0].errors).toHaveProperty('service');
  });

  it('returns error when durationMinutes is missing', () => {
    const step = {
      offerings: [
        {
          service: 'Full Groom',
          basePriceCents: 10000,
        },
      ],
    };
    const errors = validateServices(step);
    expect(Array.isArray(errors.offerings)).toBe(true);
    expect(errors.offerings[0].errors).toHaveProperty('durationMinutes');
  });

  it('returns error when durationMinutes is not a positive integer', () => {
    const step = {
      offerings: [
        {
          service: 'Full Groom',
          durationMinutes: 0,
          basePriceCents: 10000,
        },
      ],
    };
    const errors = validateServices(step);
    expect(Array.isArray(errors.offerings)).toBe(true);
    expect(errors.offerings[0].errors).toHaveProperty('durationMinutes');
  });

  it('returns error when durationMinutes is negative', () => {
    const step = {
      offerings: [
        {
          service: 'Full Groom',
          durationMinutes: -60,
          basePriceCents: 10000,
        },
      ],
    };
    const errors = validateServices(step);
    expect(Array.isArray(errors.offerings)).toBe(true);
    expect(errors.offerings[0].errors).toHaveProperty('durationMinutes');
  });

  it('returns error when durationMinutes is not an integer', () => {
    const step = {
      offerings: [
        {
          service: 'Full Groom',
          durationMinutes: 120.5,
          basePriceCents: 10000,
        },
      ],
    };
    const errors = validateServices(step);
    expect(Array.isArray(errors.offerings)).toBe(true);
    expect(errors.offerings[0].errors).toHaveProperty('durationMinutes');
  });

  it('returns error when basePriceCents is missing', () => {
    const step = {
      offerings: [
        {
          service: 'Full Groom',
          durationMinutes: 120,
        },
      ],
    };
    const errors = validateServices(step);
    expect(Array.isArray(errors.offerings)).toBe(true);
    expect(errors.offerings[0].errors).toHaveProperty('basePriceCents');
  });

  it('returns error when basePriceCents is negative', () => {
    const step = {
      offerings: [
        {
          service: 'Full Groom',
          durationMinutes: 120,
          basePriceCents: -100,
        },
      ],
    };
    const errors = validateServices(step);
    expect(Array.isArray(errors.offerings)).toBe(true);
    expect(errors.offerings[0].errors).toHaveProperty('basePriceCents');
  });

  it('returns error when basePriceCents is not an integer', () => {
    const step = {
      offerings: [
        {
          service: 'Full Groom',
          durationMinutes: 120,
          basePriceCents: 100.5,
        },
      ],
    };
    const errors = validateServices(step);
    expect(Array.isArray(errors.offerings)).toBe(true);
    expect(errors.offerings[0].errors).toHaveProperty('basePriceCents');
  });

  it('accepts basePriceCents of 0', () => {
    const step = {
      offerings: [
        {
          service: 'Full Groom',
          durationMinutes: 120,
          basePriceCents: 0,
        },
      ],
    };
    expect(validateServices(step)).toEqual({});
  });

  it('tracks error index for multiple invalid offerings', () => {
    const step = {
      offerings: [
        {
          service: 'Full Groom',
          durationMinutes: 120,
          basePriceCents: 10000,
        },
        {
          service: '',
          durationMinutes: 0,
          basePriceCents: -100,
        },
        {
          service: 'Bath Only',
          durationMinutes: 45,
          basePriceCents: 5000,
        },
      ],
    };
    const errors = validateServices(step);
    expect(Array.isArray(errors.offerings)).toBe(true);
    expect(errors.offerings.length).toBe(1);
    expect(errors.offerings[0].index).toBe(1);
  });

  it('collects all errors for a single invalid offering', () => {
    const step = {
      offerings: [
        {
          service: '',
          durationMinutes: -10,
          basePriceCents: -50,
        },
      ],
    };
    const errors = validateServices(step);
    expect(Array.isArray(errors.offerings)).toBe(true);
    expect(errors.offerings[0].errors).toHaveProperty('service');
    expect(errors.offerings[0].errors).toHaveProperty('durationMinutes');
    expect(errors.offerings[0].errors).toHaveProperty('basePriceCents');
  });
});

describe('validateAvailability', () => {
  it('returns empty errors for valid single availability block', () => {
    const step = {
      weeklyHours: [
        {
          dayOfWeek: 0,
          openTime: '09:00',
          closeTime: '17:00',
        },
      ],
    };
    expect(validateAvailability(step)).toEqual({});
  });

  it('returns empty errors for multiple valid availability blocks', () => {
    const step = {
      weeklyHours: [
        {
          dayOfWeek: 0,
          openTime: '09:00',
          closeTime: '17:00',
        },
        {
          dayOfWeek: 1,
          openTime: '10:00',
          closeTime: '18:00',
        },
        {
          dayOfWeek: 6,
          openTime: '11:00',
          closeTime: '16:00',
        },
      ],
    };
    expect(validateAvailability(step)).toEqual({});
  });

  it('returns error when weeklyHours array is missing', () => {
    const step = {};
    const errors = validateAvailability(step);
    expect(errors).toHaveProperty('weeklyHours');
  });

  it('returns error when weeklyHours array is empty', () => {
    const step = {
      weeklyHours: [],
    };
    const errors = validateAvailability(step);
    expect(errors).toHaveProperty('weeklyHours');
  });

  it('returns error when dayOfWeek is missing', () => {
    const step = {
      weeklyHours: [
        {
          openTime: '09:00',
          closeTime: '17:00',
        },
      ],
    };
    const errors = validateAvailability(step);
    expect(Array.isArray(errors.weeklyHours)).toBe(true);
    expect(errors.weeklyHours[0].errors).toHaveProperty('dayOfWeek');
  });

  it('returns error when dayOfWeek is below 0', () => {
    const step = {
      weeklyHours: [
        {
          dayOfWeek: -1,
          openTime: '09:00',
          closeTime: '17:00',
        },
      ],
    };
    const errors = validateAvailability(step);
    expect(Array.isArray(errors.weeklyHours)).toBe(true);
    expect(errors.weeklyHours[0].errors).toHaveProperty('dayOfWeek');
  });

  it('returns error when dayOfWeek is above 6', () => {
    const step = {
      weeklyHours: [
        {
          dayOfWeek: 7,
          openTime: '09:00',
          closeTime: '17:00',
        },
      ],
    };
    const errors = validateAvailability(step);
    expect(Array.isArray(errors.weeklyHours)).toBe(true);
    expect(errors.weeklyHours[0].errors).toHaveProperty('dayOfWeek');
  });

  it('returns error when dayOfWeek is not an integer', () => {
    const step = {
      weeklyHours: [
        {
          dayOfWeek: 2.5,
          openTime: '09:00',
          closeTime: '17:00',
        },
      ],
    };
    const errors = validateAvailability(step);
    expect(Array.isArray(errors.weeklyHours)).toBe(true);
    expect(errors.weeklyHours[0].errors).toHaveProperty('dayOfWeek');
  });

  it('returns error when dayOfWeek is a string', () => {
    const step = {
      weeklyHours: [
        {
          dayOfWeek: '0',
          openTime: '09:00',
          closeTime: '17:00',
        },
      ],
    };
    const errors = validateAvailability(step);
    expect(Array.isArray(errors.weeklyHours)).toBe(true);
    expect(errors.weeklyHours[0].errors).toHaveProperty('dayOfWeek');
  });

  it('returns error when openTime is missing', () => {
    const step = {
      weeklyHours: [
        {
          dayOfWeek: 0,
          closeTime: '17:00',
        },
      ],
    };
    const errors = validateAvailability(step);
    expect(Array.isArray(errors.weeklyHours)).toBe(true);
    expect(errors.weeklyHours[0].errors).toHaveProperty('openTime');
  });

  it('returns error when openTime is not a string', () => {
    const step = {
      weeklyHours: [
        {
          dayOfWeek: 0,
          openTime: 900,
          closeTime: '17:00',
        },
      ],
    };
    const errors = validateAvailability(step);
    expect(Array.isArray(errors.weeklyHours)).toBe(true);
    expect(errors.weeklyHours[0].errors).toHaveProperty('openTime');
  });

  it('returns error when closeTime is missing', () => {
    const step = {
      weeklyHours: [
        {
          dayOfWeek: 0,
          openTime: '09:00',
        },
      ],
    };
    const errors = validateAvailability(step);
    expect(Array.isArray(errors.weeklyHours)).toBe(true);
    expect(errors.weeklyHours[0].errors).toHaveProperty('closeTime');
  });

  it('returns error when closeTime is not a string', () => {
    const step = {
      weeklyHours: [
        {
          dayOfWeek: 0,
          openTime: '09:00',
          closeTime: 1700,
        },
      ],
    };
    const errors = validateAvailability(step);
    expect(Array.isArray(errors.weeklyHours)).toBe(true);
    expect(errors.weeklyHours[0].errors).toHaveProperty('closeTime');
  });

  it('returns error when openTime >= closeTime', () => {
    const step = {
      weeklyHours: [
        {
          dayOfWeek: 0,
          openTime: '17:00',
          closeTime: '09:00',
        },
      ],
    };
    const errors = validateAvailability(step);
    expect(Array.isArray(errors.weeklyHours)).toBe(true);
    expect(errors.weeklyHours[0].errors).toHaveProperty('timeRange');
  });

  it('returns error when openTime equals closeTime', () => {
    const step = {
      weeklyHours: [
        {
          dayOfWeek: 0,
          openTime: '09:00',
          closeTime: '09:00',
        },
      ],
    };
    const errors = validateAvailability(step);
    expect(Array.isArray(errors.weeklyHours)).toBe(true);
    expect(errors.weeklyHours[0].errors).toHaveProperty('timeRange');
  });

  it('tracks error index for multiple blocks', () => {
    const step = {
      weeklyHours: [
        {
          dayOfWeek: 0,
          openTime: '09:00',
          closeTime: '17:00',
        },
        {
          dayOfWeek: 8,
          openTime: '17:00',
          closeTime: '09:00',
        },
        {
          dayOfWeek: 2,
          openTime: '10:00',
          closeTime: '18:00',
        },
      ],
    };
    const errors = validateAvailability(step);
    expect(Array.isArray(errors.weeklyHours)).toBe(true);
    expect(errors.weeklyHours.length).toBe(1);
    expect(errors.weeklyHours[0].index).toBe(1);
  });

  it('collects all errors for a single invalid block', () => {
    const step = {
      weeklyHours: [
        {
          dayOfWeek: 10,
          openTime: 900,
          closeTime: 1700,
        },
      ],
    };
    const errors = validateAvailability(step);
    expect(Array.isArray(errors.weeklyHours)).toBe(true);
    expect(errors.weeklyHours[0].errors).toHaveProperty('dayOfWeek');
    expect(errors.weeklyHours[0].errors).toHaveProperty('openTime');
    expect(errors.weeklyHours[0].errors).toHaveProperty('closeTime');
  });
});

describe('isValid', () => {
  it('returns true for empty errors object', () => {
    expect(isValid({})).toBe(true);
  });

  it('returns false for errors object with one key', () => {
    expect(isValid({ name: 'Name is required' })).toBe(false);
  });

  it('returns false for errors object with multiple keys', () => {
    expect(
      isValid({
        name: 'Name is required',
        salon: 'Salon is required',
      })
    ).toBe(false);
  });

  it('returns false when errors contain nested error arrays', () => {
    expect(
      isValid({
        offerings: [
          {
            index: 0,
            errors: { service: 'Service is required' },
          },
        ],
      })
    ).toBe(false);
  });

  it('returns true for object with only inherited properties', () => {
    const emptyWithInherit = Object.create(null);
    expect(isValid(emptyWithInherit)).toBe(true);
  });
});

describe('integration: validateBusiness + isValid', () => {
  it('correctly identifies valid business data', () => {
    const step = {
      name: 'Happy Paws',
      salon: 'Main Location',
    };
    const errors = validateBusiness(step);
    expect(isValid(errors)).toBe(true);
  });

  it('correctly identifies invalid business data', () => {
    const step = {
      name: '',
      salon: '',
    };
    const errors = validateBusiness(step);
    expect(isValid(errors)).toBe(false);
  });
});

describe('integration: validateLocation + isValid', () => {
  it('correctly identifies valid location data with coordinates', () => {
    const step = {
      address: '123 Main St',
      lat: 40.7128,
      lng: -74.006,
    };
    const errors = validateLocation(step);
    expect(isValid(errors)).toBe(true);
  });

  it('correctly identifies valid location data with placeId', () => {
    const step = {
      address: '123 Main St',
      placeId: 'ChIJYVZ8wP4LkIARhXDrNAASEWM',
    };
    const errors = validateLocation(step);
    expect(isValid(errors)).toBe(true);
  });

  it('correctly identifies invalid location data', () => {
    const step = {
      address: '',
    };
    const errors = validateLocation(step);
    expect(isValid(errors)).toBe(false);
  });
});

describe('integration: validateServices + isValid', () => {
  it('correctly identifies valid services data', () => {
    const step = {
      offerings: [
        {
          service: 'Full Groom',
          durationMinutes: 120,
          basePriceCents: 10000,
        },
      ],
    };
    const errors = validateServices(step);
    expect(isValid(errors)).toBe(true);
  });

  it('correctly identifies invalid services data', () => {
    const step = {
      offerings: [],
    };
    const errors = validateServices(step);
    expect(isValid(errors)).toBe(false);
  });
});

describe('integration: validateAvailability + isValid', () => {
  it('correctly identifies valid availability data', () => {
    const step = {
      weeklyHours: [
        {
          dayOfWeek: 0,
          openTime: '09:00',
          closeTime: '17:00',
        },
      ],
    };
    const errors = validateAvailability(step);
    expect(isValid(errors)).toBe(true);
  });

  it('correctly identifies invalid availability data', () => {
    const step = {
      weeklyHours: [],
    };
    const errors = validateAvailability(step);
    expect(isValid(errors)).toBe(false);
  });
});
