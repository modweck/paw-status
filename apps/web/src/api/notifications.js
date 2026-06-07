const NOTIFICATION_FIELDS = `
  id,
  kind,
  title,
  body,
  data,
  read_at,
  created_at
`;

/**
 * Map notification database row to API response object
 * @param {Object} row - Database row
 * @returns {Object|null} Mapped notification object or null
 */
export function mapNotificationRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    kind: row.kind || '',
    title: row.title || '',
    body: row.body || '',
    data: row.data || null,
    readAt: row.read_at || null,
    createdAt: row.created_at || '',
  };
}

/**
 * Load all notifications for the current user
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array>} Array of notifications ordered by creation date (newest first)
 */
export async function loadNotifications(supabase) {
  const { data, error } = await supabase
    .from('notifications')
    .select(NOTIFICATION_FIELDS)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(mapNotificationRow);
}

/**
 * Mark a notification as read
 * @param {Object} supabase - Supabase client
 * @param {string} notificationId - Notification ID
 * @returns {Promise<Object>} Updated notification
 */
export async function markNotificationRead(supabase, notificationId) {
  const { data, error } = await supabase
    .from('notifications')
    .update({
      read_at: new Date().toISOString(),
    })
    .eq('id', notificationId)
    .select(NOTIFICATION_FIELDS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapNotificationRow(data);
}

/**
 * Subscribe to real-time notification updates for the current user
 * Sets up a Supabase Realtime channel on the notifications table filtered to the caller's user ID.
 *
 * @param {Object} supabase - Supabase client
 * @param {Function} onNotification - Callback function called when a notification payload is received
 * @returns {Function} Unsubscribe function to clean up the channel
 */
export function subscribeNotifications(supabase, onNotification) {
  // Subscribe to the notifications table with a filter for the current user
  // The RLS policy ensures only the user's own notifications are visible
  const channel = supabase
    .channel('notifications')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'notifications',
    }, (payload) => {
      // Call the callback with the new payload
      onNotification(payload);
    })
    .subscribe();

  // Return an unsubscribe function
  return () => {
    supabase.removeChannel(channel);
  };
}
