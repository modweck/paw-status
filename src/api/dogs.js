const DOG_FIELDS = [
  'id',
  'customer_id',
  'name',
  'breed',
  'size',
  'birthdate',
  'weight_lbs',
  'coat_type',
  'temperament',
  'allergies',
  'preferred_service_id',
  'preferred_groomer_id',
  'preferred_groomer_name',
  'last_groomed_at',
  'grooming_interval_weeks',
  'notes',
  'created_at',
].join(', ');

export const DOG_SIZE_OPTIONS = [
  { value: 'toy', label: 'Toy' },
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'xlarge', label: 'Extra large' },
];

const DOG_SIZE_VALUES = new Set(DOG_SIZE_OPTIONS.map((option) => option.value));

export function mapDogRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    customerId: row.customer_id,
    name: row.name || '',
    breed: row.breed || '',
    size: row.size || '',
    birthdate: row.birthdate || '',
    weightLbs: row.weight_lbs ?? null,
    coatType: row.coat_type || '',
    temperament: row.temperament || '',
    allergies: row.allergies || '',
    preferredServiceId: row.preferred_service_id || '',
    preferredGroomerId: row.preferred_groomer_id || '',
    preferredGroomerName: row.preferred_groomer_name || '',
    lastGroomedAt: row.last_groomed_at || '',
    groomingIntervalWeeks: row.grooming_interval_weeks ?? null,
    notes: row.notes || '',
    createdAt: row.created_at || '',
  };
}

function requireCustomerId(customer) {
  if (!customer?.id) {
    throw new Error('Customer profile required before dog profiles.');
  }

  return customer.id;
}

function cleanOptionalText(value) {
  const cleaned = String(value || '').trim();
  return cleaned || null;
}

function cleanDogName(value) {
  const cleaned = cleanOptionalText(value);
  if (!cleaned) {
    throw new Error('Dog name is required.');
  }

  return cleaned;
}

function normalizeDogSize(value) {
  const cleaned = String(value || '').trim().toLowerCase();
  if (!cleaned) return null;
  if (!DOG_SIZE_VALUES.has(cleaned)) {
    throw new Error('Choose a valid dog size.');
  }

  return cleaned;
}

function cleanDate(value, label) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    throw new Error(`${label} must be a valid date.`);
  }

  return cleaned;
}

function cleanPositiveNumber(value, label) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }

  return parsed;
}

function cleanPositiveInteger(value, label) {
  const parsed = cleanPositiveNumber(value, label);
  if (parsed === null) return null;
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be a whole number.`);
  }

  return parsed;
}

export async function loadDogsForCustomer(supabase, customer) {
  const customerId = requireCustomerId(customer);
  const { data, error } = await supabase
    .from('dogs')
    .select(DOG_FIELDS)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(mapDogRow);
}

export async function createDogForCustomer(supabase, customer, dogInput = {}) {
  const customerId = requireCustomerId(customer);
  const row = {
    customer_id: customerId,
    name: cleanDogName(dogInput.name),
    breed: cleanOptionalText(dogInput.breed),
    size: normalizeDogSize(dogInput.size),
    birthdate: cleanDate(dogInput.birthdate, 'Birthday'),
    weight_lbs: cleanPositiveNumber(dogInput.weightLbs, 'Weight'),
    coat_type: cleanOptionalText(dogInput.coatType),
    temperament: cleanOptionalText(dogInput.temperament),
    allergies: cleanOptionalText(dogInput.allergies),
    preferred_service_id: cleanOptionalText(dogInput.preferredServiceId),
    preferred_groomer_id: cleanOptionalText(dogInput.preferredGroomerId),
    preferred_groomer_name: cleanOptionalText(dogInput.preferredGroomerName),
    last_groomed_at: cleanDate(dogInput.lastGroomedAt, 'Last groomed'),
    grooming_interval_weeks: cleanPositiveInteger(
      dogInput.groomingIntervalWeeks,
      'Grooming cadence',
    ),
    notes: cleanOptionalText(dogInput.notes),
  };

  const { data, error } = await supabase
    .from('dogs')
    .insert(row)
    .select(DOG_FIELDS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapDogRow(data);
}
