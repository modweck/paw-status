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

vi.mock('./NotificationBell.jsx', () => ({
  NotificationBell: () => <div>NotificationBell</div>,
}));

vi.mock('../lib/supabaseClient.js', () => ({
  requireSupabaseClient: () => ({ id: 'supabase-client' }),
}));

const customerRoute = { persona: 'customer', section: 'explore' };
const staffRoute = { persona: 'staff', section: 'requests' };
const adminRoute = { persona: 'admin', section: 'verification' };

describe('AppShell customer nav', () => {
  beforeEach(() => {
    authState = {
      user: { email: 'owner@example.com' },
      signOut: vi.fn(),
    };
  });

  it('shows only customer destinations in the customer bottom nav', () => {
    render(
      <AppShell route={customerRoute}>
        <div>Customer app</div>
      </AppShell>,
    );

    expect(screen.getByRole('link', { name: /Explore/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /My Dog/i })).toHaveAttribute('href', '/dogs');
    expect(screen.getByRole('link', { name: /Bookings/i })).toHaveAttribute('href', '/bookings');
    expect(screen.getByRole('link', { name: /Account/i })).toHaveAttribute('href', '/account');
    expect(screen.queryByRole('link', { name: /Groomer/i })).not.toBeInTheDocument();
  });

  it('routes signed-out dog and account nav taps to the sign-in gate', () => {
    authState = {
      user: null,
      signOut: vi.fn(),
    };

    render(
      <AppShell route={customerRoute}>
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
      <AppShell route={customerRoute}>
        <div>Customer app</div>
      </AppShell>,
    );

    expect(screen.getByRole('link', { name: /My Dog/i })).not.toHaveClass('is-locked');
    expect(screen.getByRole('link', { name: /Account/i })).not.toHaveClass('is-locked');
  });

  it('marks the active customer section from the route', () => {
    render(
      <AppShell route={{ persona: 'customer', section: 'bookings' }}>
        <div>Customer app</div>
      </AppShell>,
    );

    expect(screen.getByRole('link', { name: /Bookings/i })).toHaveClass('is-active');
    expect(screen.getByRole('link', { name: /Explore/i })).not.toHaveClass('is-active');
  });

  it('mounts NotificationBell when user is signed in', () => {
    render(
      <AppShell route={customerRoute}>
        <div>Customer app</div>
      </AppShell>,
    );

    expect(screen.getByText('NotificationBell')).toBeInTheDocument();
  });

  it('does not mount NotificationBell when user is not signed in', () => {
    authState = {
      user: null,
      signOut: vi.fn(),
    };

    render(
      <AppShell route={customerRoute}>
        <div>Customer app</div>
      </AppShell>,
    );

    expect(screen.queryByText('NotificationBell')).not.toBeInTheDocument();
  });
});

describe('AppShell staff nav', () => {
  beforeEach(() => {
    authState = {
      user: { email: 'groomer@example.com' },
      signOut: vi.fn(),
    };
  });

  it('shows staff workspace destinations instead of the customer nav', () => {
    render(
      <AppShell route={staffRoute}>
        <div>Staff app</div>
      </AppShell>,
    );

    expect(screen.getByRole('link', { name: /Requests/i })).toHaveAttribute('href', '/groomer');
    expect(screen.getByRole('link', { name: /Waitlist/i })).toHaveAttribute(
      'href',
      '/groomer/waitlist',
    );
    expect(screen.getByRole('link', { name: /Setup/i })).toHaveAttribute('href', '/groomer/setup');
    expect(screen.queryByRole('link', { name: /My Dog/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Explore/i })).not.toBeInTheDocument();
  });

  it('marks the active staff section from the route', () => {
    render(
      <AppShell route={{ persona: 'staff', section: 'waitlist' }}>
        <div>Staff app</div>
      </AppShell>,
    );

    expect(screen.getByRole('link', { name: /Waitlist/i })).toHaveClass('is-active');
    expect(screen.getByRole('link', { name: /Requests/i })).not.toHaveClass('is-active');
  });

  it('labels the workspace so groomers know they left the customer app', () => {
    render(
      <AppShell route={staffRoute}>
        <div>Staff app</div>
      </AppShell>,
    );

    expect(screen.getByText(/Groomer workspace/i)).toBeInTheDocument();
  });
});

describe('AppShell admin', () => {
  it('renders no bottom nav for the admin workspace', () => {
    authState = {
      user: { email: 'admin@example.com' },
      signOut: vi.fn(),
    };

    render(
      <AppShell route={adminRoute}>
        <div>Admin app</div>
      </AppShell>,
    );

    expect(screen.queryByRole('navigation', { name: /Primary/i })).not.toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });
});
