const APPOINTMENT_FIELDS = `
  id,
  dog_id,
  groomer_id,
  service_id,
  scheduled_at,
  duration_minutes,
  status,
  created_at
`;

const APPOINTMENT_REQUEST_FIELDS = `
  id,
  customer_id,
  dog_id,
  groomer_id,
  service,
  status,
  created_at,
  updated_at
`;

/**
 * Map appointment database row to API response object
 * @param {Object} row - Database row
 * @returns {Object|null} Mapped appointment object or null
 */
export function mapAppointmentRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    dogId: row.dog_id,
    groomerId: row.groomer_id,
    serviceId: row.service_id || '',
    scheduledAt: row.scheduled_at || '',
    durationMinutes: row.duration_minutes ?? null,
    status: row.status || '',
    createdAt: row.created_at || '',
  };
}

/**
 * Map appointment request database row to API response object
 * @param {Object} row - Database row
 * @returns {Object|null} Mapped appointment request object or null
 */
export function mapAppointmentRequestRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    customerId: row.customer_id,
    dogId: row.dog_id,
    groomerId: row.groomer_id,
    service: row.service || '',
    status: row.status || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}

/**
 * Create a slot booking request for a customer
 * @param {Object} supabase - Supabase client
 * @param {Object} params - Request parameters
 * @param {string} params.customerId - Customer ID
 * @param {string} params.dogId - Dog ID
 * @param {string} params.groomerId - Groomer ID
 * @param {string} params.service - Service name
 * @param {Array} params.preferredWindows - Preferred time windows
 * @param {string} [params.customerNotes] - Optional customer notes
 * @returns {Promise<Object>} Created appointment request
 */
export async function createSlotBookingRequest(supabase, params) {
  const row = {
    customer_id: params.customerId,
    dog_id: params.dogId,
    groomer_id: params.groomerId,
    service: params.service,
    preferred_windows: params.preferredWindows || [],
    customer_notes: params.customerNotes || null,
    status: 'requested',
  };

  const { data, error } = await supabase
    .from('appointment_requests')
    .insert(row)
    .select(APPOINTMENT_REQUEST_FIELDS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapAppointmentRequestRow(data);
}

/**
 * Confirm an appointment request and create a confirmed appointment
 * @param {Object} supabase - Supabase client
 * @param {string} requestId - Appointment request ID
 * @param {string} slotAt - ISO timestamp for the scheduled slot
 * @returns {Promise<string>} ID of the created appointment
 */
export async function confirmRequest(supabase, requestId, slotAt) {
  const { data, error } = await supabase.rpc('confirm_appointment_request', {
    p_request_id: requestId,
    p_slot_at: slotAt,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Decline an appointment request
 * @param {Object} supabase - Supabase client
 * @param {string} requestId - Appointment request ID
 * @param {string} [note] - Optional decline reason/note
 * @returns {Promise<void>}
 */
export async function declineRequest(supabase, requestId, note) {
  const { error } = await supabase.rpc('decline_appointment_request', {
    p_request_id: requestId,
    p_note: note || null,
  });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Cancel an existing appointment
 * @param {Object} supabase - Supabase client
 * @param {string} appointmentId - Appointment ID
 * @param {string} [reason] - Optional cancellation reason
 * @returns {Promise<void>}
 */
export async function cancelAppointment(supabase, appointmentId, reason) {
  const { error } = await supabase.rpc('cancel_appointment', {
    p_appointment_id: appointmentId,
    p_reason: reason || null,
  });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Load all appointment requests for a groomer
 * @param {Object} supabase - Supabase client
 * @param {string} groomerId - Groomer ID
 * @returns {Promise<Array>} Array of appointment requests
 */
export async function loadGroomerRequests(supabase, groomerId) {
  const { data, error } = await supabase
    .from('appointment_requests')
    .select(APPOINTMENT_REQUEST_FIELDS)
    .eq('groomer_id', groomerId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(mapAppointmentRequestRow);
}

/**
 * Load all confirmed appointments for a customer
 * @param {Object} supabase - Supabase client
 * @param {string} customerId - Customer ID
 * @returns {Promise<Array>} Array of appointments
 */
export async function loadCustomerAppointments(supabase, customerId) {
  // Get the customer's dog IDs first
  const { data: dogs, error: dogsError } = await supabase
    .from('dogs')
    .select('id')
    .eq('customer_id', customerId);

  if (dogsError) {
    throw new Error(dogsError.message);
  }

  if (!dogs || dogs.length === 0) {
    return [];
  }

  const dogIds = dogs.map((d) => d.id);

  // Load appointments for those dogs
  const { data, error } = await supabase
    .from('appointments')
    .select(APPOINTMENT_FIELDS)
    .in('dog_id', dogIds)
    .order('scheduled_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(mapAppointmentRow);
}
