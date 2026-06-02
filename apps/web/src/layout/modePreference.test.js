// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import {
  loadPreferredMode,
  MODE_CUSTOMER,
  MODE_GROOMER,
  savePreferredMode,
} from './modePreference.js';

const userA = { id: 'auth-user-a' };
const userB = { id: 'auth-user-b' };

afterEach(() => {
  window.localStorage.clear();
});

describe('modePreference', () => {
  it('round-trips a saved mode per user', () => {
    savePreferredMode(userA, MODE_GROOMER);
    expect(loadPreferredMode(userA)).toBe(MODE_GROOMER);
  });

  it('defaults to customer when nothing is stored', () => {
    expect(loadPreferredMode(userA)).toBe(MODE_CUSTOMER);
  });

  it('defaults to customer when there is no user', () => {
    expect(loadPreferredMode(null)).toBe(MODE_CUSTOMER);
  });

  it('ignores an unknown stored value', () => {
    window.localStorage.setItem(`paw-status:preferred-mode:${userA.id}`, 'astronaut');
    expect(loadPreferredMode(userA)).toBe(MODE_CUSTOMER);
  });

  it('does not leak modes across users', () => {
    savePreferredMode(userA, MODE_GROOMER);
    expect(loadPreferredMode(userB)).toBe(MODE_CUSTOMER);
  });

  it('does not persist an invalid mode or without a user', () => {
    savePreferredMode(userA, 'astronaut');
    savePreferredMode(null, MODE_GROOMER);
    expect(loadPreferredMode(userA)).toBe(MODE_CUSTOMER);
  });
});
