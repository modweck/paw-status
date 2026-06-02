import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App, currentRoute } from './App.jsx';
import { loadPreferredMode, savePreferredMode } from './layout/modePreference.js';

let authState = {
  user: { id: 'auth-user-1', email: 'owner@example.com' },
  signOut: vi.fn(),
};

vi.mock('./auth/AuthProvider.jsx', () => ({
  useAuth: () => authState,
}));

vi.mock('./customer/CustomerApp.jsx', () => ({
  CustomerApp: ({ initialSection }) => <div>Customer section: {initialSection}</div>,
}));

vi.mock('./admin/AdminVerificationPanel.jsx', () => ({
  AdminVerificationPanel: () => <div>Admin verification workspace</div>,
}));

vi.mock('./groomer/StaffDashboard.jsx', () => ({
  StaffDashboard: () => <div>Groomer workspace</div>,
}));

vi.mock('./layout/modePreference.js', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    loadPreferredMode: vi.fn(() => 'customer'),
    savePreferredMode: vi.fn(),
  };
});

describe('app route detection', () => {
  beforeEach(() => {
    authState = {
      user: { id: 'auth-user-1', email: 'owner@example.com' },
      signOut: vi.fn(),
    };
    window.history.pushState(null, '', '/');
  });

  it('keeps groomer routes in the groomer workspace', () => {
    expect(currentRoute('/groomer')).toBe('staff');
    expect(currentRoute('/staff/requests')).toBe('staff');
  });

  it('keeps admin verification routes in the admin workspace', () => {
    expect(currentRoute('/admin')).toBe('admin');
    expect(currentRoute('/admin/groomer-verification')).toBe('admin');
  });

  it('routes customer bottom nav destinations to customer sections', () => {
    expect(currentRoute('/')).toBe('customer');
    expect(currentRoute('/dogs')).toBe('dogs');
    expect(currentRoute('/bookings')).toBe('bookings');
    expect(currentRoute('/account')).toBe('account');
  });

  it('updates customer sections without a full page reload when bottom nav is clicked', () => {
    render(<App />);

    expect(screen.getByText('Customer section: customer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /My Dog/i }));

    expect(window.location.pathname).toBe('/dogs');
    expect(screen.getByText('Customer section: dogs')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /Account/i }));

    expect(window.location.pathname).toBe('/account');
    expect(screen.getByText('Customer section: account')).toBeInTheDocument();
  });

  it('renders the admin verification workspace for admin routes', () => {
    window.history.pushState(null, '', '/admin/groomer-verification');

    render(<App />);

    expect(screen.getByText('Admin verification workspace')).toBeInTheDocument();
  });

  it('restores the originating path after a magic-link callback', () => {
    window.history.pushState(null, '', '/auth/callback?next=%2Fgroomer');

    render(<App />);

    expect(window.location.pathname).toBe('/groomer');
    expect(screen.getByText('Groomer workspace')).toBeInTheDocument();
  });

  it('ignores unsafe protocol-relative next paths on the callback', () => {
    window.history.pushState(null, '', '/auth/callback?next=%2F%2Fevil.com');

    render(<App />);

    // Stays on the callback path (no off-site redirect), falls back to customer.
    expect(window.location.pathname).toBe('/auth/callback');
    expect(screen.getByText('Customer section: customer')).toBeInTheDocument();
  });
});

describe('app mode persistence', () => {
  beforeEach(() => {
    authState = {
      user: { id: 'auth-user-1', email: 'owner@example.com' },
      signOut: vi.fn(),
    };
    loadPreferredMode.mockReturnValue('customer');
    savePreferredMode.mockClear();
    window.history.pushState(null, '', '/');
  });

  it('restores the groomer view on a bare-root load when that was the last mode', () => {
    loadPreferredMode.mockReturnValue('groomer');

    render(<App />);

    expect(window.location.pathname).toBe('/groomer');
    expect(screen.getByText('Groomer workspace')).toBeInTheDocument();
  });

  it('does not redirect when the remembered mode is customer', () => {
    loadPreferredMode.mockReturnValue('customer');

    render(<App />);

    expect(window.location.pathname).toBe('/');
    expect(screen.getByText('Customer section: customer')).toBeInTheDocument();
  });

  it('does not let the remembered mode override a magic-link next path', () => {
    loadPreferredMode.mockReturnValue('groomer');
    window.history.pushState(null, '', '/auth/callback?next=%2Fdogs');

    render(<App />);

    expect(window.location.pathname).toBe('/dogs');
  });

  it('does not redirect away from a customer deep link with a step param', () => {
    loadPreferredMode.mockReturnValue('groomer');
    window.history.pushState(null, '', '/?step=results');

    render(<App />);

    expect(window.location.pathname).toBe('/');
    expect(screen.getByText('Customer section: customer')).toBeInTheDocument();
  });

  it('persists the mode when the user switches into the groomer view', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Groomer/i }));

    expect(window.location.pathname).toBe('/groomer');
    expect(savePreferredMode).toHaveBeenCalledWith(expect.anything(), 'groomer');
  });
});
