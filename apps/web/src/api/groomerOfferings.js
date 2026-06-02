// CRUD for a groomer's bookable service offerings. RLS limits writes to
// groomers the caller owns through a verified membership.
const OFFERING_FIELDS =
  'id, groomer_id, service, duration_minutes, base_price_cents, size_modifier_json, breed_modifier_json';

export function mapOfferingRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    groomerId: row.groomer_id,
    service: row.service || '',
    durationMinutes: row.duration_minutes ?? null,
    basePriceCents: row.base_price_cents ?? null,
    sizeModifiers: row.size_modifier_json ?? null,
    breedModifiers: row.breed_modifier_json ?? null,
  };
}

function cleanService(value) {
  const service = String(value ?? '').trim();
  if (!service) throw new Error('Choose a service.');
  return service;
}

function cleanDuration(value) {
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw new Error('Duration must be a positive number of minutes.');
  }
  return minutes;
}

function cleanPriceCents(value) {
  if (value === null || value === undefined || value === '') return null;
  const cents = Number(value);
  if (!Number.isInteger(cents)) throw new Error('Price must be a whole number of cents.');
  if (cents < 0) throw new Error('Price cannot be negative.');
  return cents;
}

// Build the column row from a partial input. `requireAll` forces the
// not-null columns (service, duration) to be present — used on create.
function buildOfferingRow(input, { requireAll }) {
  const row = {};

  if (requireAll || 'service' in input) row.service = cleanService(input.service);
  if (requireAll || 'durationMinutes' in input) row.duration_minutes = cleanDuration(input.durationMinutes);
  if (requireAll || 'basePriceCents' in input) row.base_price_cents = cleanPriceCents(input.basePriceCents);
  if (requireAll || 'sizeModifiers' in input) row.size_modifier_json = input.sizeModifiers ?? null;
  if (requireAll || 'breedModifiers' in input) row.breed_modifier_json = input.breedModifiers ?? null;

  return row;
}

export async function loadOfferings(supabase, groomerId) {
  if (!groomerId) throw new Error('Groomer id is required.');

  const { data, error } = await supabase
    .from('groomer_offerings')
    .select(OFFERING_FIELDS)
    .eq('groomer_id', groomerId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map(mapOfferingRow);
}

export async function createOffering(supabase, groomerId, input = {}) {
  if (!groomerId) throw new Error('Groomer id is required.');

  const row = { groomer_id: groomerId, ...buildOfferingRow(input, { requireAll: true }) };

  const { data, error } = await supabase
    .from('groomer_offerings')
    .insert(row)
    .select(OFFERING_FIELDS)
    .single();

  if (error) throw new Error(error.message);
  return mapOfferingRow(data);
}

export async function updateOffering(supabase, offeringId, input = {}) {
  if (!offeringId) throw new Error('Offering id is required.');

  const row = buildOfferingRow(input, { requireAll: false });

  const { data, error } = await supabase
    .from('groomer_offerings')
    .update(row)
    .eq('id', offeringId)
    .select(OFFERING_FIELDS)
    .single();

  if (error) throw new Error(error.message);
  return mapOfferingRow(data);
}

export async function deleteOffering(supabase, offeringId) {
  if (!offeringId) throw new Error('Offering id is required.');

  const { error } = await supabase.from('groomer_offerings').delete().eq('id', offeringId);
  if (error) throw new Error(error.message);
}
