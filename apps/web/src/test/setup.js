import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';

// jsdom provides window.localStorage at startup, but a handful of tests (and
// some libraries) replace it with undefined between renders. Restore a
// working in-memory shim before every test so component effects that touch
// window.localStorage never blow up. Keep behavior identical to the native
// Storage API surface we actually use: getItem/setItem/removeItem/clear/key.
function createInMemoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(String(key), String(value));
    },
    removeItem: (key) => {
      store.delete(String(key));
    },
    clear: () => {
      store.clear();
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

beforeEach(() => {
  if (typeof window === 'undefined') return;
  if (!window.localStorage || typeof window.localStorage.getItem !== 'function') {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      writable: true,
      value: createInMemoryStorage(),
    });
  } else {
    // Deliberate global reset: every test starts with an empty localStorage
    // so cross-test pollution is impossible. If you need fixture state, set
    // it inside the test's own beforeEach AFTER this one runs. Do NOT rely
    // on beforeAll for localStorage state — it will be cleared between tests.
    window.localStorage.clear();
  }
});
