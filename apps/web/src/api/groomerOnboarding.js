/**
 * Groomer onboarding API module.
 * Handles creation and management of groomer profiles, service offerings,
 * availability, time off, and waitlist preferences.
 */

/**
 * Create an owned groomer profile via the create_owned_groomer RPC.
 * Maps camelCase params to snake_case database columns.
 * @param {object} supabase - Supabase client
 * @param {object} params - Creation parameters
 * @param {string} params.groomerId - Groomer ID to own
 * @param {string} [params.bioText] - Groomer bio/description
 * @returns {Promise<object>} Mapped groomer data
 * @throws {Error} On Supabase error
 */
export async function createOwnedGroomer(supabase, params = {}) {
  const rpcParams = {
    groomer_id: params.groomerId,
    bio_text: params.bioText || null,
  };

  const { data, error } = await supabase.rpc('create_owned_groomer', rpcParams);

  if (error) {
    throw new Error(error.message);
  }

  return mapGroomerData(data);
}

/**
 * Save or update a service offering for a groomer.
 * Inserts or upserts into groomer_service_offerings table.
 * @param {object} supabase - Supabase client
 * @param {string} groomerId - Groomer ID
 * @param {object} offering - Service offering data
 * @param {string} [offering.id] - Offering ID (if updating)
 * @param {string} offering.serviceName - Service name
 * @param {number} offering.basePriceCents - Base price in cents
 * @param {number} [offering.durationMinutes] - Duration in minutes
 * @param {string} [offering.description] - Service description
 * @returns {Promise<object>} Mapped offering data
 * @throws {Error} On Supabase error
 */
export async function saveOffering(supabase, groomerId, offering = {}) {
  const row = {
    groomer_id: groomerId,
    service_name: offering.serviceName,
    base_price_cents: offering.basePriceCents,
    duration_minutes: offering.durationMinutes || null,
    description: offering.description || null,
  };

  if (offering.id) {
    row.id = offering.id;
  }

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
 * Inserts or upserts into groomer_availability table.
 * @param {object} supabase - Supabase client
 * @param {string} groomerId - Groomer ID
 * @param {object} block - Availability block data
 * @param {string} [block.id] - Block ID (if updating)
 * @param {string} block.dayOfWeek - Day of week (0-6, Sunday=0)
 * @param {string} block.startTimeHHMM - Start time (HH:MM format)
 * @param {string} block.endTimeHHMM - End time (HH:MM format)
 * @returns {Promise<object>} Mapped availability data
 * @throws {Error} On Supabase error
 */
export async function saveAvailabilityBlock(supabase, groomerId, block = {}) {
  const row = {
    groomer_id: groomerId,
    day_of_week: block.dayOfWeek,
    start_time_hhmm: block.startTimeHHMM,
    end_time_hhmm: block.endTimeHHMM,
  };

  if (block.id) {
    row.id = block.id;
  }

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
 * Inserts into groomer_time_off table.
 * @param {object} supabase - Supabase client
 * @param {string} groomerId - Groomer ID
 * @param {object} entry - Time-off entry data
 * @param {string} entry.startDate - Start date (YYYY-MM-DD format)
 * @param {string} entry.endDate - End date (YYYY-MM-DD format)
 * @param {string} [entry.reason] - Reason for time off
 * @returns {Promise<object>} Mapped time-off data
 * @throws {Error} On Supabase error
 */
export async function saveTimeOff(supabase, groomerId, entry = {}) {
  const row = {
    groomer_id: groomerId,
    start_date: entry.startDate,
    end_date: entry.endDate,
    reason: entry.reason || null,
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
    bioText: row.bio_text || '',
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
    serviceName: row.service_name || '',
    basePriceCents: row.base_price_cents || 0,
    durationMinutes: row.duration_minutes || null,
    description: row.description || '',
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
    startTimeHHMM: row.start_time_hhmm || '',
    endTimeHHMM: row.end_time_hhmm || '',
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
    startDate: row.start_date || '',
    endDate: row.end_date || '',
    reason: row.reason || '',
  };
}
