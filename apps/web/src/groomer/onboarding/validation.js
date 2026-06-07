/**
 * Validates business step data (name and salon).
 * @param {Object} step - The business step data
 * @returns {Object} Errors object, empty when valid
 */
export function validateBusiness(step) {
  const errors = {};

  if (!step?.name || typeof step.name !== 'string' || step.name.trim() === '') {
    errors.name = 'Business name is required';
  }

  if (!step?.salon || typeof step.salon !== 'string' || step.salon.trim() === '') {
    errors.salon = 'Salon/grooming location is required';
  }

  return errors;
}

/**
 * Validates location step data (address and coordinates or placeId).
 * @param {Object} step - The location step data
 * @returns {Object} Errors object, empty when valid
 */
export function validateLocation(step) {
  const errors = {};

  if (!step?.address || typeof step.address !== 'string' || step.address.trim() === '') {
    errors.address = 'Address is required';
  }

  const hasCoordinates = typeof step?.lat === 'number' && typeof step?.lng === 'number';
  const hasPlaceId = step?.placeId && typeof step.placeId === 'string';

  if (!hasCoordinates && !hasPlaceId) {
    errors.location = 'Either coordinates (lat/lng) or placeId is required';
  }

  return errors;
}

/**
 * Validates services step data (at least one offering with required fields).
 * @param {Object} step - The services step data
 * @returns {Object} Errors object, empty when valid
 */
export function validateServices(step) {
  const errors = {};

  if (!Array.isArray(step?.offerings) || step.offerings.length === 0) {
    errors.offerings = 'At least one service offering is required';
    return errors;
  }

  const serviceErrors = [];

  step.offerings.forEach((offering, index) => {
    const offeringErrors = {};

    if (
      !offering?.service ||
      typeof offering.service !== 'string' ||
      offering.service.trim() === ''
    ) {
      offeringErrors.service = 'Service name is required';
    }

    if (
      typeof offering?.durationMinutes !== 'number' ||
      !Number.isInteger(offering.durationMinutes) ||
      offering.durationMinutes <= 0
    ) {
      offeringErrors.durationMinutes = 'Duration must be a positive integer';
    }

    if (
      typeof offering?.basePriceCents !== 'number' ||
      !Number.isInteger(offering.basePriceCents) ||
      offering.basePriceCents < 0
    ) {
      offeringErrors.basePriceCents = 'Price must be a non-negative integer';
    }

    if (Object.keys(offeringErrors).length > 0) {
      serviceErrors.push({
        index,
        errors: offeringErrors,
      });
    }
  });

  if (serviceErrors.length > 0) {
    errors.offerings = serviceErrors;
  }

  return errors;
}

/**
 * Validates availability step data (at least one weekly hours block).
 * @param {Object} step - The availability step data
 * @returns {Object} Errors object, empty when valid
 */
export function validateAvailability(step) {
  const errors = {};

  if (!Array.isArray(step?.weeklyHours) || step.weeklyHours.length === 0) {
    errors.weeklyHours = 'At least one weekly availability block is required';
    return errors;
  }

  const hourErrors = [];

  step.weeklyHours.forEach((block, index) => {
    const blockErrors = {};

    if (
      typeof block?.dayOfWeek !== 'number' ||
      !Number.isInteger(block.dayOfWeek) ||
      block.dayOfWeek < 0 ||
      block.dayOfWeek > 6
    ) {
      blockErrors.dayOfWeek = 'Day of week must be an integer between 0 and 6';
    }

    if (!block?.openTime || typeof block.openTime !== 'string') {
      blockErrors.openTime = 'Opening time is required';
    }

    if (!block?.closeTime || typeof block.closeTime !== 'string') {
      blockErrors.closeTime = 'Closing time is required';
    }

    if (block?.openTime && block?.closeTime && block.openTime >= block.closeTime) {
      blockErrors.timeRange = 'Opening time must be before closing time';
    }

    if (Object.keys(blockErrors).length > 0) {
      hourErrors.push({
        index,
        errors: blockErrors,
      });
    }
  });

  if (hourErrors.length > 0) {
    errors.weeklyHours = hourErrors;
  }

  return errors;
}

/**
 * Checks if an errors object is valid (empty).
 * @param {Object} errors - The errors object to check
 * @returns {boolean} True if errors object is empty
 */
export function isValid(errors) {
  return Object.keys(errors).length === 0;
}
