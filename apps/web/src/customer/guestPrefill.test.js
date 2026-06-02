// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import {
  GUEST_PREFILL_STORAGE_KEY,
  loadGuestPrefill,
  saveGuestPrefill,
} from './guestPrefill.js';

afterEach(() => {
  window.localStorage.clear();
});

describe('guestPrefill', () => {
  it('round-trips the stored guest fields', () => {
    saveGuestPrefill({
      customerName: 'Alex',
      customerEmail: 'alex@example.com',
      customerPhone: '+12125551212',
      dogName: 'Mochi',
      dogBreed: 'Mini poodle',
      dogSize: 'small',
      dogNotes: 'Fragrance-free shampoo.',
    });

    expect(loadGuestPrefill()).toEqual({
      customerName: 'Alex',
      customerEmail: 'alex@example.com',
      customerPhone: '+12125551212',
      dogName: 'Mochi',
      dogBreed: 'Mini poodle',
      dogSize: 'small',
      dogNotes: 'Fragrance-free shampoo.',
    });
  });

  it('returns an empty object when nothing is stored', () => {
    expect(loadGuestPrefill()).toEqual({});
  });

  it('returns an empty object when the stored value is malformed', () => {
    window.localStorage.setItem(GUEST_PREFILL_STORAGE_KEY, '{not valid json');
    expect(loadGuestPrefill()).toEqual({});
  });

  it('only persists known string fields and skips empties', () => {
    saveGuestPrefill({ customerName: 'Alex', dogName: '', junk: 'nope', dogSize: 42 });
    expect(loadGuestPrefill()).toEqual({ customerName: 'Alex' });
  });
});
