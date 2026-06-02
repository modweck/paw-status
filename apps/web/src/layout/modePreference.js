// Remembers whether a signed-in user last used the customer ("dog owner") or
// groomer view, so the app can restore that mode on a fresh load. Local-only;
// keyed per user so a shared browser doesn't leak modes between accounts.
export const MODE_CUSTOMER = 'customer';
export const MODE_GROOMER = 'groomer';

const VALID_MODES = new Set([MODE_CUSTOMER, MODE_GROOMER]);

function storageKey(user) {
  return user?.id ? `paw-status:preferred-mode:${user.id}` : null;
}

function getStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
}

export function loadPreferredMode(user) {
  const key = storageKey(user);
  const storage = getStorage();
  if (!key || !storage) return MODE_CUSTOMER;

  try {
    const value = storage.getItem(key);
    return VALID_MODES.has(value) ? value : MODE_CUSTOMER;
  } catch {
    return MODE_CUSTOMER;
  }
}

export function savePreferredMode(user, mode) {
  const key = storageKey(user);
  const storage = getStorage();
  if (!key || !storage || !VALID_MODES.has(mode)) return;

  try {
    storage.setItem(key, mode);
  } catch {
    // Best-effort; ignore quota / serialization failures.
  }
}
