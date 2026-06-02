import { fireEvent, render, screen } from '@testing-library/react';
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

  it('keeps customer destinations in the bottom nav and drops the Groomer tab', () => {
    render(
      <AppShell route="customer">
        <div>Customer app</div>
      </AppShell>,
    );

    expect(screen.getByRole('link', { name: /Explore/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /My Dog/i })).toHaveAttribute('href', '/dogs');
    expect(screen.getByRole('link', { name: /Account/i })).toHaveAttribute('href', '/account');
    expect(screen.getByRole('link', { name: /Bookings/i })).toHaveAttribute('href', '/bookings');
    // The Groomer tab is removed — the top toggle is the only entry point.
    expect(screen.queryByRole('link', { name: /Groomer/i })).not.toBeInTheDocument();
  });

  it('routes signed-out dog and account nav taps to the sign-in gate', () => {
    authState = { user: null, signOut: vi.fn() };

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

  it('switches to the groomer view via the top toggle when signed in', () => {
    const onNavigate = vi.fn();
    render(
      <AppShell route="customer" onNavigate={onNavigate}>
        <div>Customer app</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Groomer/i }));
    expect(onNavigate).toHaveBeenCalledWith('/groomer');
  });

  it('switches back to the dog-owner view from the groomer route', () => {
    const onNavigate = vi.fn();
    render(
      <AppShell route="staff" onNavigate={onNavigate}>
        <div>Groomer workspace</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Dog owner/i }));
    expect(onNavigate).toHaveBeenCalledWith('/');
  });

  it('hides the role toggle when signed out', () => {
    authState = { user: null, signOut: vi.fn() };

    render(
      <AppShell route="customer">
        <div>Customer app</div>
      </AppShell>,
    );

    expect(
      screen.queryByRole('group', { name: /switch between dog owner and groomer/i }),
    ).not.toBeInTheDocument();
  });
});
