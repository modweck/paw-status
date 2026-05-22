import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App, currentRoute } from './App.jsx';

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

vi.mock('./groomer/StaffDashboard.jsx', () => ({
  StaffDashboard: () => <div>Groomer workspace</div>,
}));

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
});
