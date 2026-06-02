// Remembers guest booking contact + dog details locally so a returning guest
// doesn't have to retype them. Stores only what the guest typed; never used
// for signed-in customers (they have profiles).
export const GUEST_PREFILL_STORAGE_KEY = 'paw-status:guest-booking-prefill';

const PREFILL_FIELDS = [
  'customerName',
  'customerEmail',
  'customerPhone',
  'dogName',
  'dogBreed',
  'dogSize',
  'dogNotes',
];

function getStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
}

export function loadGuestPrefill() {
  const storage = getStorage();
  if (!storage) return {};

  try {
    const raw = storage.getItem(GUEST_PREFILL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    const result = {};
    for (const field of PREFILL_FIELDS) {
      if (typeof parsed[field] === 'string' && parsed[field]) {
        result[field] = parsed[field];
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function saveGuestPrefill(values = {}) {
  const storage = getStorage();
  if (!storage) return;

  const payload = {};
  for (const field of PREFILL_FIELDS) {
    if (typeof values[field] === 'string' && values[field]) {
      payload[field] = values[field];
    }
  }

  try {
    storage.setItem(GUEST_PREFILL_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota / serialization failures — prefill is best-effort.
  }
}
