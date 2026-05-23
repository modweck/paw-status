// Trusted notification command placeholder.
// Current SMS/push functions are thin experiments and should not accept arbitrary
// customer-facing payloads from the browser.

export const NOTIFICATION_COMMAND_TODOS = Object.freeze([
  'Load notification context from appointment/request ids server-side.',
  'Check customer notification preferences and valid phone/email before sending.',
  'Send only after the related database state transition succeeds.',
  'Use idempotency keys to avoid duplicate SMS/push sends on retry.',
  'Persist attempts, provider message ids, response payloads, retry state, and support-visible errors.',
  'Decide whether OneSignal stays; remove push code if the first production release is SMS-only.',
]);

export async function sendBookingNotification(_context = {}, _input = {}) {
  // TODO(notifications): Replace direct SMS/push function calls with command
  // routes that authorize the actor and load trusted appointment/request data.
  throw new Error('sendBookingNotification is not implemented yet.');
}

export async function recordNotificationAttempt(_context = {}, _input = {}) {
  // TODO(notifications): Add persistence before sending real customer-facing
  // notifications so retries and support audits are traceable.
  throw new Error('recordNotificationAttempt is not implemented yet.');
}
