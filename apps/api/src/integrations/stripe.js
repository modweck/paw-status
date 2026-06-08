/**
 * Creates a Stripe integration adapter that handles deposit intents.
 * @param {{ supabase: any }} config - Configuration object containing supabase client
 * @returns {{ createDepositIntent: (appointmentId: string) => Promise<{ externalRef: string; status: string }> }}
 */
export function createStripeAdapter({ supabase }) {
  return {
    /**
     * Creates a deposit intent for an appointment via the Stripe provider.
     * @param {string} appointmentId - The appointment ID
     * @returns {Promise<{ externalRef: string; status: string }>}
     */
    async createDepositIntent(appointmentId) {
      const { data, error } = await supabase.rpc('create_deposit_intent', {
        appointment_id: appointmentId,
      });

      if (error) {
        throw error;
      }

      return {
        externalRef: data?.external_ref,
        status: data?.status,
      };
    },
  };
}
