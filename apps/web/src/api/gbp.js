/**
 * Map groomer integration database row to API response object
 * @param {Object} row - Database row
 * @returns {Object|null} Mapped integration object or null
 */
export function mapIntegrationRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    groomerId: row.groomer_id,
    provider: row.provider || '',
    status: row.status || '',
    metadata: row.metadata || {},
    createdAt: row.created_at || '',
  };
}

/**
 * Connect a groomer's Google Business Profile (GBP) integration
 * @param {Object} supabase - Supabase client
 * @param {string} groomerId - Groomer ID
 * @returns {Promise<Object>} Integration ID
 */
export async function connectGbp(supabase, groomerId) {
  const { data, error } = await supabase.rpc('connect_gbp', {
    p_groomer_id: groomerId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    integrationId: data,
  };
}

/**
 * Load all integrations for a groomer
 * @param {Object} supabase - Supabase client
 * @param {string} groomerId - Groomer ID
 * @returns {Promise<Array>} Array of integration objects
 */
export async function loadIntegrations(supabase, groomerId) {
  const { data, error } = await supabase
    .from('groomer_integrations')
    .select('id, groomer_id, provider, status, metadata, created_at')
    .eq('groomer_id', groomerId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(mapIntegrationRow);
}
