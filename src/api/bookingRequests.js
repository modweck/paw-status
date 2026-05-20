const BOOKING_REQUEST_FIELDS =
  'id, customer_id, dog_id, groomer_id, service, preferred_windows, customer_notes, status, external_booking_url, created_at';

export const PREFERRED_WINDOW_OPTIONS = [
  { value: 'first-available', label: 'First available' },
  { value: 'weekday-morning', label: 'Weekday morning' },
  { value: 'weekday-afternoon', label: 'Weekday afternoon' },
  { value: 'weekday-evening', label: 'Weekday evening' },
  { value: 'weekend', label: 'Weekend' },
];

const PREFERRED_WINDOW_VALUES = new Set(PREFERRED_WINDOW_OPTIONS.map((option) => option.value));

export const TIME_OF_DAY_OPTIONS = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
];

const TIME_OF_DAY_VALUES = new Set(TIME_OF_DAY_OPTIONS.map((option) => option.value));
const REQUEST_TIMING_TYPES = new Set(['first-available', 'preferred-date', 'backup-date']);

export function mapBookingRequestRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    customerId: row.customer_id,
    dogId: row.dog_id,
    groomerId: row.groomer_id,
    service: row.service || '',
    preferredWindows: Array.isArray(row.preferred_windows) ? row.preferred_windows : [],
    customerNotes: row.customer_notes || '',
    status: row.status || '',
    externalBookingUrl: row.external_booking_url || '',
    createdAt: row.created_at || '',
  };
}

function cleanOptionalText(value) {
  const cleaned = String(value || '').trim();
  return cleaned || null;
}

function requireCustomerId(customer) {
  if (!customer?.id) {
    throw new Error('Customer profile required before booking requests.');
  }

  return customer.id;
}

function requireOwnedDog(customer, dog) {
  if (!dog?.id || dog.customerId !== customer.id) {
    throw new Error('Choose one of your dog profiles.');
  }

  return dog.id;
}

function requireGroomerId(groomer) {
  if (!groomer?.id) {
    throw new Error('Choose a groomer before requesting a booking.');
  }

  return groomer.id;
}

function cleanService(value) {
  const cleaned = cleanOptionalText(value);
  if (!cleaned) {
    throw new Error('Choose a service.');
  }

  return cleaned;
}

function cleanDate(value, message) {
  const cleaned = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    throw new Error(message);
  }

  return cleaned;
}

function cleanTimeOfDay(value) {
  const cleaned = String(value || '').trim();
  if (!TIME_OF_DAY_VALUES.has(cleaned)) {
    throw new Error('Choose a valid time of day.');
  }

  return cleaned;
}

function normalizePreferredWindow(window) {
  if (typeof window === 'string') {
    const legacyValue = window.trim();
    if (legacyValue === 'first-available') {
      return { type: 'first-available' };
    }
    if (PREFERRED_WINDOW_VALUES.has(legacyValue)) {
      return legacyValue;
    }
    return null;
  }

  if (!window || typeof window !== 'object') return null;
  if (!REQUEST_TIMING_TYPES.has(window.type)) return null;

  if (window.type === 'first-available') {
    return { type: 'first-available' };
  }

  return {
    type: window.type,
    date: cleanDate(
      window.date,
      window.type === 'backup-date'
        ? 'Choose a valid backup date.'
        : 'Choose a valid preferred date.',
    ),
    timeOfDay: cleanTimeOfDay(window.timeOfDay),
  };
}

export function buildPreferredWindows({
  backupDate = '',
  backupTimeOfDay = 'afternoon',
  firstAvailable = true,
  preferredDate = '',
  preferredTimeOfDay = 'morning',
} = {}) {
  return [
    firstAvailable ? { type: 'first-available' } : null,
    preferredDate
      ? {
          type: 'preferred-date',
          date: preferredDate,
          timeOfDay: preferredTimeOfDay,
        }
      : null,
    backupDate
      ? {
          type: 'backup-date',
          date: backupDate,
          timeOfDay: backupTimeOfDay,
        }
      : null,
  ].filter(Boolean);
}

function normalizePreferredWindows(windows = []) {
  const normalized = windows.map(normalizePreferredWindow).filter(Boolean);

  if (!normalized.length) {
    throw new Error('Choose first available or a preferred date.');
  }

  return normalized;
}

export async function createBookingRequest(supabase, customer, dog, groomer, requestInput = {}) {
  const customerId = requireCustomerId(customer);
  const dogId = requireOwnedDog(customer, dog);
  const groomerId = requireGroomerId(groomer);
  const externalBookingUrl = cleanOptionalText(groomer.website);

  const row = {
    customer_id: customerId,
    dog_id: dogId,
    groomer_id: groomerId,
    service: cleanService(requestInput.service),
    preferred_windows: normalizePreferredWindows(requestInput.preferredWindows || []),
    customer_notes: cleanOptionalText(requestInput.customerNotes),
    status: externalBookingUrl ? 'external_handoff' : 'requested',
    external_booking_url: externalBookingUrl,
  };

  const { data, error } = await supabase
    .from('appointment_requests')
    .insert(row)
    .select(BOOKING_REQUEST_FIELDS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapBookingRequestRow(data);
}
