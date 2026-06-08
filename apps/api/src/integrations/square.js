/**
 * Creates a Square integration adapter that handles booking operations.
 * @returns {{ pushBooking: (appointment: any) => { ref: string }; syncAvailability: () => { synced: boolean } }}
 */
export function createSquareAdapter() {
  return {
    /**
     * Pushes an appointment booking to Square.
     * @param {any} appointment - The appointment object
     * @returns {{ ref: string }}
     */
    pushBooking(appointment) {
      return {
        ref: `sq_demo_${appointment.id}`,
      };
    },

    /**
     * Syncs availability with Square (no-op for mock).
     * @returns {{ synced: boolean }}
     */
    syncAvailability() {
      return {
        synced: true,
      };
    },
  };
}
