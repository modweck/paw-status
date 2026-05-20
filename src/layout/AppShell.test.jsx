import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from './AppShell.jsx';

let authState = {
  user: { email: 'owner@example.com' },
  signOut: vi.fn(),
};

vi.mock('../auth/AuthProvider.jsx', () => ({
  useAuth: () => authState,
}));

describe('AppShell', () => {
  beforeEach(() => {
    authState = {
      user: { email: 'owner@example.com' },
      signOut: vi.fn(),
    };
  });

  it('keeps customer dog and account destinations in the bottom nav', () => {
    render(
      <AppShell route="customer">
        <div>Customer app</div>
      </AppShell>,
    );

    expect(screen.getByRole('link', { name: /Explore/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /My Dog/i })).toHaveAttribute('href', '/dogs');
    expect(screen.getByRole('link', { name: /Account/i })).toHaveAttribute('href', '/account');
    expect(screen.getByRole('link', { name: /Bookings/i })).toHaveAttribute('href', '/bookings');
    expect(screen.getByRole('link', { name: /Groomer/i })).toHaveAttribute('href', '/groomer');
  });

  it('routes signed-out dog and account nav taps to the sign-in gate', () => {
    authState = {
      user: null,
      signOut: vi.fn(),
    };

    render(
      <AppShell route="customer">
        <div>Customer app</div>
      </AppShell>,
    );

    expect(screen.getByRole('link', { name: /My Dog/i })).toHaveAttribute('href', '/bookings');
    expect(screen.getByRole('link', { name: /My Dog/i })).toHaveClass('is-locked');
    expect(screen.getByRole('link', { name: /Account/i })).toHaveAttribute('href', '/bookings');
    expect(screen.getByRole('link', { name: /Account/i })).toHaveClass('is-locked');
  });

  it('shows dog and account nav items as available when signed in', () => {
    render(
      <AppShell route="customer">
        <div>Customer app</div>
      </AppShell>,
    );

    expect(screen.getByRole('link', { name: /My Dog/i })).not.toHaveClass('is-locked');
    expect(screen.getByRole('link', { name: /Account/i })).not.toHaveClass('is-locked');
  });
});
