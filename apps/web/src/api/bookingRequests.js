const BOOKING_REQUEST_FIELDS =
  'id, customer_id, dog_id, groomer_id, service, preferred_windows, customer_notes, status, external_booking_url, created_at';

const BOOKING_REQUEST_LIST_FIELDS = `id, customer_id, dog_id, groomer_id, service, preferred_windows, customer_notes, status, external_booking_url, created_at, updated_at,
  groomer:groomers ( id, name, salon ),
  dog:dogs ( id, name )`;

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

function unwrapNested(value) {
  // PostgREST returns embedded resources as either a single object or a
  // single-item array depending on the join cardinality. Normalise so the
  // caller can rely on a plain object.
  return Array.isArray(value) ? value[0] || null : value || null;
}

export function mapBookingRequestListRow(row) {
  if (!row) return null;

  const groomer = unwrapNested(row.groomer);
  const dog = unwrapNested(row.dog);

  return {
    ...mapBookingRequestRow(row),
    updatedAt: row.updated_at || row.created_at || '',
    groomer: groomer
      ? {
          id: groomer.id || null,
          name: groomer.name || null,
          salon: groomer.salon || null,
        }
      : null,
    dog: dog
      ? {
          id: dog.id || null,
          name: dog.name || null,
        }
      : null,
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

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTime(value) {
  return TIME_PATTERN.test(String(value || '').trim());
}

function cleanOptionalTime(value) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return null;
  if (!isValidTime(cleaned)) {
    throw new Error('Choose a valid time.');
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

  const normalized = {
    type: window.type,
    date: cleanDate(
      window.date,
      window.type === 'backup-date'
        ? 'Choose a valid backup date.'
        : 'Choose a valid preferred date.',
    ),
    timeOfDay: cleanTimeOfDay(window.timeOfDay),
  };

  const time = cleanOptionalTime(window.time);
  if (time) {
    normalized.time = time;
  }

  return normalized;
}

export function buildPreferredWindows({
  backupDate = '',
  backupTimeOfDay = 'afternoon',
  backupTime = '',
  firstAvailable = true,
  preferredDate = '',
  preferredTimeOfDay = 'morning',
  preferredTime = '',
} = {}) {
  return [
    firstAvailable ? { type: 'first-available' } : null,
    preferredDate
      ? {
          type: 'preferred-date',
          date: preferredDate,
          timeOfDay: preferredTimeOfDay,
          ...(preferredTime ? { time: preferredTime } : {}),
        }
      : null,
    backupDate
      ? {
          type: 'backup-date',
          date: backupDate,
          timeOfDay: backupTimeOfDay,
          ...(backupTime ? { time: backupTime } : {}),
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
  // TODO(booking): Keep this as request-packet creation until apps/api owns
  // availability, double-booking prevention, and confirmed appointment creation.
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

export async function loadCustomerBookingRequests(supabase, customer) {
  const customerId = requireCustomerId(customer);
  const { data, error } = await supabase
    .from('appointment_requests')
    .select(BOOKING_REQUEST_LIST_FIELDS)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(mapBookingRequestListRow).filter(Boolean);
}
