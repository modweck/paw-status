/**
 * Map payment intent database row to API response object
 * @param {Object} row - Database row
 * @returns {Object|null} Mapped payment intent object or null
 */
export function mapPaymentIntentRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    appointmentId: row.appointment_id,
    customerId: row.customer_id,
    externalRef: row.external_ref || '',
    amountCents: row.amount_cents || 0,
    status: row.status || '',
    createdAt: row.created_at || '',
  };
}

/**
 * Create a deposit intent for an appointment
 * @param {Object} supabase - Supabase client
 * @param {string} appointmentId - Appointment ID
 * @returns {Promise<Object>} Created payment intent with externalRef and status
 */
export async function createDepositIntent(supabase, appointmentId) {
  const { data, error } = await supabase.rpc('create_deposit_intent', {
    p_appointment_id: appointmentId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    externalRef: data?.external_ref,
    status: data?.status,
  };
}

/**
 * Load payment intent for an appointment
 * @param {Object} supabase - Supabase client
 * @param {string} appointmentId - Appointment ID
 * @returns {Promise<Object|null>} Payment intent or null
 */
export async function loadAppointmentPayment(supabase, appointmentId) {
  const { data, error } = await supabase
    .from('payment_intents')
    .select('id, appointment_id, customer_id, external_ref, amount_cents, status, created_at')
    .eq('appointment_id', appointmentId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return mapPaymentIntentRow(data);
}
