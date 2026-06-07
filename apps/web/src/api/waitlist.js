// Waitlist API module for Phase 4
//
// Handles customer waitlist operations (join, view, claim offers)
// and groomer operations (view waitlist, offer slots).
//
// Exports:
//   - fetchNextAvailable(params)           - calls POST /api/next-available
//   - joinWaitlist(supabase, entry)        - creates a waitlist entry
//   - loadMyWaitlist(supabase)             - loads customer's waitlist entries
//   - loadMyOffers(supabase)               - loads offers for customer's entries
//   - claimOffer(supabase, offerId)        - claims a waitlist offer
//   - loadGroomerWaitlist(supabase, groomerId) - loads entries targeting a groomer
//   - offerSlot(supabase, groomerId, slotAt, serviceId) - offers a slot to next waiter

const ENTRY_FIELDS = [
  'id',
  'customer_id',
  'groomer_id',
  'service_id',
  'status',
  'location',
  'radius_m',
  'created_at',
].join(', ');

const ENTRY_FIELDS_WITH_DETAILS = `
  id,
  customer_id,
  groomer_id,
  service_id,
  status,
  location,
  radius_m,
  created_at,
  customers:customer_id (
    id,
    name,
    email,
    phone
  ),
  groomer_service_offerings:service_id (
    id,
    service_name
  )
`;

const OFFER_FIELDS = [
  'id',
  'entry_id',
  'groomer_id',
  'service_id',
  'slot_at',
  'duration_minutes',
  'status',
  'expires_at',
  'created_at',
].join(', ');

function mapWaitlistEntryRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    customerId: row.customer_id,
    groomerId: row.groomer_id,
    serviceId: row.service_id,
    status: row.status,
    location: row.location,
    radiusM: row.radius_m,
    createdAt: row.created_at,
  };
}

function mapWaitlistEntryWithDetailsRow(row) {
  if (!row) return null;

  const customer = row.customers ? { name: row.customers.name || '' } : null;
  const service = row.groomer_service_offerings ? { name: row.groomer_service_offerings.service_name || '' } : null;

  return {
    id: row.id,
    customerId: row.customer_id,
    groomerId: row.groomer_id,
    serviceId: row.service_id,
    status: row.status,
    location: row.location,
    radiusM: row.radius_m,
    createdAt: row.created_at,
    customer,
    service,
  };
}

function mapWaitlistOfferRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    entryId: row.entry_id,
    groomerId: row.groomer_id,
    serviceId: row.service_id,
    slotAt: row.slot_at,
    durationMinutes: row.duration_minutes,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

async function readJsonResponse(response) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error || 'Request failed.');
  }

  return body;
}

/**
 * Fetch next available slots across groomers near a location.
 * Calls POST /api/next-available with { lat, lng, radiusM, serviceId, topN }
 *
 * @param {{ lat: number, lng: number, radiusM: number, serviceId: string, topN?: number }} params
 * @returns {Promise<Array<{ slotAt: string, iso: string, groomerId: string, groomerName: string }>>}
 */
export async function fetchNextAvailable(params) {
  const response = await fetch('/api/next-available', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  return readJsonResponse(response);
}

/**
 * Join a waitlist (global/geo or groomer-specific).
 *
 * @param {object} supabase - Supabase client
 * @param {{ customerId: string, groomerId?: string, serviceId: string, location?: object, radiusM?: number }} entry
 * @returns {Promise<object>} Mapped waitlist entry
 */
export async function joinWaitlist(supabase, entry = {}) {
  const row = {
    customer_id: entry.customerId,
    groomer_id: entry.groomerId || null,
    service_id: entry.serviceId,
    location: entry.location || null,
    radius_m: entry.radiusM || null,
    status: 'active',
  };

  const { data, error } = await supabase
    .from('waitlist_entries')
    .insert(row)
    .select(ENTRY_FIELDS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapWaitlistEntryRow(data);
}

/**
 * Load all waitlist entries for the authenticated customer.
 *
 * @param {object} supabase - Supabase client
 * @returns {Promise<Array<object>>} Array of mapped waitlist entries
 */
export async function loadMyWaitlist(supabase) {
  const { data, error } = await supabase
    .from('waitlist_entries')
    .select(ENTRY_FIELDS)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(mapWaitlistEntryRow);
}

/**
 * Load all pending/active offers for the authenticated customer's entries.
 *
 * @param {object} supabase - Supabase client
 * @returns {Promise<Array<object>>} Array of mapped waitlist offers
 */
export async function loadMyOffers(supabase) {
  const { data, error } = await supabase
    .from('waitlist_offers')
    .select(OFFER_FIELDS)
    .in('status', ['pending', 'claimed'])
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(mapWaitlistOfferRow);
}

/**
 * Claim a waitlist offer (creates appointment and marks offer/entry as fulfilled).
 * This calls the claim_waitlist_offer() RPC function.
 *
 * @param {object} supabase - Supabase client
 * @param {string} offerId - The waitlist_offer.id to claim
 * @returns {Promise<string>} Appointment ID
 */
export async function claimOffer(supabase, offerId) {
  const { data, error } = await supabase.rpc('claim_waitlist_offer', {
    p_offer_id: offerId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Load all waitlist entries targeting a specific groomer (for groomer view).
 * This shows the groomer which customers are waiting for them.
 * Includes customer and service details for display purposes.
 *
 * @param {object} supabase - Supabase client
 * @param {string} groomerId - The groomer ID
 * @returns {Promise<Array<object>>} Array of mapped waitlist entries with details
 */
export async function loadGroomerWaitlist(supabase, groomerId) {
  const { data, error } = await supabase
    .from('waitlist_entries')
    .select(ENTRY_FIELDS_WITH_DETAILS)
    .eq('groomer_id', groomerId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(mapWaitlistEntryWithDetailsRow);
}

/**
 * Offer a specific time slot to the next waiting customer.
 * This calls the offer_waitlist_slot() RPC function.
 *
 * @param {object} supabase - Supabase client
 * @param {string} groomerId - The groomer offering the slot
 * @param {string} slotAt - ISO timestamp of the slot start time
 * @param {string} serviceId - The service ID for this slot
 * @returns {Promise<string>} Offer ID (or null if no eligible entries)
 */
export async function offerSlot(supabase, groomerId, slotAt, serviceId) {
  const { data, error } = await supabase.rpc('offer_waitlist_slot', {
    p_groomer_id: groomerId,
    p_slot_at: slotAt,
    p_service_id: serviceId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
