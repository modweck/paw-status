/**
 * Groomer onboarding API module.
 * Handles creation and management of groomer profiles, service offerings,
 * availability, time off, and waitlist preferences.
 *
 * Column names and RPC signatures follow the live schema:
 * - create_owned_groomer / refresh_groomer_services:
 *   supabase/migrations/20260607000001_add_groomer_onboarding_rpcs.sql
 * - groomer_service_offerings (service, duration_minutes, base_price_cents),
 *   groomer_availability (day_of_week, open_time, close_time),
 *   groomer_time_off (start_at, end_at):
 *   supabase/migrations/20260529000002 + 20260529000004 rename migration
 */

/**
 * Create a self-owned groomer profile via the create_owned_groomer RPC.
 * The RPC atomically creates the groomers row and a verified owner
 * membership for the caller's groomer account, and returns the new
 * groomer's uuid.
 * @param {object} supabase - Supabase client
 * @param {object} params - Creation parameters
 * @param {string} params.name - Business/groomer display name (required)
 * @param {string} params.salon - Salon name (required)
 * @param {string} [params.address] - Street address
 * @param {number} [params.lat] - Latitude
 * @param {number} [params.lng] - Longitude
 * @param {string} [params.phone] - Contact phone
 * @param {string} [params.website] - Website URL
 * @returns {Promise<{id: string}>} The new groomer id
 * @throws {Error} On validation or Supabase error
 */
export async function createOwnedGroomer(supabase, params = {}) {
  if (!params.name || !String(params.name).trim()) {
    throw new Error('Business name is required.');
  }

  if (!params.salon || !String(params.salon).trim()) {
    throw new Error('Salon name is required.');
  }

  const { data, error } = await supabase.rpc('create_owned_groomer', {
    p_name: params.name,
    p_salon: params.salon,
    p_address: params.address || null,
    p_lat: Number.isFinite(params.lat) ? params.lat : null,
    p_lng: Number.isFinite(params.lng) ? params.lng : null,
    p_phone: params.phone || null,
    p_website: params.website || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { id: data };
}

/**
 * Recompute groomers.services from the structured offerings so the new
 * business shows up in service-filtered customer search.
 * @param {object} supabase - Supabase client
 * @param {string} groomerId - Groomer ID
 * @returns {Promise<void>}
 * @throws {Error} On Supabase error
 */
export async function refreshGroomerServices(supabase, groomerId) {
  const { error } = await supabase.rpc('refresh_groomer_services', {
    p_groomer_id: groomerId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Save or update a service offering for a groomer.
 * @param {object} supabase - Supabase client
 * @param {string} groomerId - Groomer ID
 * @param {object} offering - Service offering data
 * @param {string} [offering.id] - Offering ID (if updating)
 * @param {string} offering.service - Service name
 * @param {number} offering.durationMinutes - Duration in minutes (NOT NULL in schema)
 * @param {number} offering.basePriceCents - Base price in cents
 * @returns {Promise<object>} Mapped offering data
 * @throws {Error} On Supabase error
 */
export async function saveOffering(supabase, groomerId, offering = {}) {
  const row = {
    groomer_id: groomerId,
    service: offering.service,
    duration_minutes: offering.durationMinutes,
    base_price_cents: offering.basePriceCents,
  };

  const query = offering.id
    ? supabase
        .from('groomer_service_offerings')
        .update(row)
        .eq('id', offering.id)
        .select()
        .single()
    : supabase
        .from('groomer_service_offerings')
        .insert(row)
        .select()
        .single();

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return mapOfferingData(data);
}

/**
 * Save or update an availability block for a groomer.
 * @param {object} supabase - Supabase client
 * @param {string} groomerId - Groomer ID
 * @param {object} block - Availability block data
 * @param {string} [block.id] - Block ID (if updating)
 * @param {number} block.dayOfWeek - Day of week (0-6, Sunday=0)
 * @param {string} block.openTime - Opening time (HH:MM)
 * @param {string} block.closeTime - Closing time (HH:MM)
 * @returns {Promise<object>} Mapped availability data
 * @throws {Error} On Supabase error
 */
export async function saveAvailabilityBlock(supabase, groomerId, block = {}) {
  const row = {
    groomer_id: groomerId,
    day_of_week: block.dayOfWeek,
    open_time: block.openTime,
    close_time: block.closeTime,
  };

  const query = block.id
    ? supabase
        .from('groomer_availability')
        .update(row)
        .eq('id', block.id)
        .select()
        .single()
    : supabase
        .from('groomer_availability')
        .insert(row)
        .select()
        .single();

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return mapAvailabilityData(data);
}

/**
 * Delete an availability block.
 * @param {object} supabase - Supabase client
 * @param {string} blockId - Availability block ID to delete
 * @returns {Promise<void>}
 * @throws {Error} On Supabase error
 */
export async function deleteAvailabilityBlock(supabase, blockId) {
  const { error } = await supabase
    .from('groomer_availability')
    .delete()
    .eq('id', blockId);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Save a time-off entry for a groomer.
 * @param {object} supabase - Supabase client
 * @param {string} groomerId - Groomer ID
 * @param {object} entry - Time-off entry data
 * @param {string} entry.startAt - Start timestamp (ISO 8601)
 * @param {string} entry.endAt - End timestamp (ISO 8601)
 * @returns {Promise<object>} Mapped time-off data
 * @throws {Error} On Supabase error
 */
export async function saveTimeOff(supabase, groomerId, entry = {}) {
  const row = {
    groomer_id: groomerId,
    start_at: entry.startAt,
    end_at: entry.endAt,
  };

  const { data, error } = await supabase
    .from('groomer_time_off')
    .insert(row)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapTimeOffData(data);
}

/**
 * Set the waitlist opt-in preference for a groomer.
 * Updates the groomers.accepts_waitlist column.
 * @param {object} supabase - Supabase client
 * @param {string} groomerId - Groomer ID
 * @param {boolean} enabled - Whether to accept waitlist bookings
 * @returns {Promise<object>} Mapped groomer data
 * @throws {Error} On Supabase error
 */
export async function setWaitlistOptIn(supabase, groomerId, enabled) {
  const { data, error } = await supabase
    .from('groomers')
    .update({ accepts_waitlist: enabled })
    .eq('id', groomerId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapGroomerData(data);
}

/**
 * Map groomer database row to camelCase object.
 * @param {object} row - Database row
 * @returns {object} Mapped groomer data
 */
function mapGroomerData(row) {
  if (!row) return null;

  return {
    id: row.id,
    name: row.name || '',
    salon: row.salon || '',
    address: row.address || '',
    phone: row.phone || '',
    website: row.website || '',
    acceptsWaitlist: row.accepts_waitlist !== false,
  };
}

/**
 * Map service offering database row to camelCase object.
 * @param {object} row - Database row
 * @returns {object} Mapped offering data
 */
function mapOfferingData(row) {
  if (!row) return null;

  return {
    id: row.id,
    groomerId: row.groomer_id,
    service: row.service || '',
    durationMinutes: row.duration_minutes || null,
    basePriceCents: row.base_price_cents || 0,
  };
}

/**
 * Map availability database row to camelCase object.
 * @param {object} row - Database row
 * @returns {object} Mapped availability data
 */
function mapAvailabilityData(row) {
  if (!row) return null;

  return {
    id: row.id,
    groomerId: row.groomer_id,
    dayOfWeek: row.day_of_week,
    openTime: row.open_time || '',
    closeTime: row.close_time || '',
  };
}

/**
 * Map time-off database row to camelCase object.
 * @param {object} row - Database row
 * @returns {object} Mapped time-off data
 */
function mapTimeOffData(row) {
  if (!row) return null;

  return {
    id: row.id,
    groomerId: row.groomer_id,
    startAt: row.start_at || '',
    endAt: row.end_at || '',
  };
}
