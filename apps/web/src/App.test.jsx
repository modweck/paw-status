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
  CustomerApp: ({ section }) => <div>Customer section: {section}</div>,
}));

vi.mock('./admin/AdminVerificationPanel.jsx', () => ({
  AdminVerificationPanel: () => <div>Admin verification workspace</div>,
}));

vi.mock('./groomer/StaffDashboard.jsx', () => ({
  StaffDashboard: ({ section }) => <div>Groomer workspace: {section}</div>,
}));

describe('app route detection', () => {
  beforeEach(() => {
    authState = {
      user: { id: 'auth-user-1', email: 'owner@example.com' },
      signOut: vi.fn(),
    };
    window.history.pushState(null, '', '/');
  });

  it('maps groomer routes to staff persona sections', () => {
    expect(currentRoute('/groomer')).toEqual({ persona: 'staff', section: 'requests' });
    expect(currentRoute('/groomer/waitlist')).toEqual({ persona: 'staff', section: 'waitlist' });
    expect(currentRoute('/groomer/setup')).toEqual({ persona: 'staff', section: 'setup' });
    expect(currentRoute('/staff')).toEqual({ persona: 'staff', section: 'requests' });
    expect(currentRoute('/staff/waitlist')).toEqual({ persona: 'staff', section: 'waitlist' });
  });

  it('maps admin verification routes to the admin persona', () => {
    expect(currentRoute('/admin')).toEqual({ persona: 'admin', section: 'verification' });
    expect(currentRoute('/admin/groomer-verification')).toEqual({
      persona: 'admin',
      section: 'verification',
    });
  });

  it('maps customer bottom nav destinations to customer sections', () => {
    expect(currentRoute('/')).toEqual({ persona: 'customer', section: 'explore' });
    expect(currentRoute('/dogs')).toEqual({ persona: 'customer', section: 'dogs' });
    expect(currentRoute('/bookings')).toEqual({ persona: 'customer', section: 'bookings' });
    expect(currentRoute('/account')).toEqual({ persona: 'customer', section: 'account' });
  });

  it('updates customer sections without a full page reload when bottom nav is clicked', () => {
    render(<App />);

    expect(screen.getByText('Customer section: explore')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /My Dog/i }));

    expect(window.location.pathname).toBe('/dogs');
    expect(screen.getByText('Customer section: dogs')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /Account/i }));

    expect(window.location.pathname).toBe('/account');
    expect(screen.getByText('Customer section: account')).toBeInTheDocument();
  });

  it('renders staff sections from staff sub-routes', () => {
    window.history.pushState(null, '', '/groomer/waitlist');

    render(<App />);

    expect(screen.getByText('Groomer workspace: waitlist')).toBeInTheDocument();
  });

  it('renders the admin verification workspace for admin routes', () => {
    window.history.pushState(null, '', '/admin/groomer-verification');

    render(<App />);

    expect(screen.getByText('Admin verification workspace')).toBeInTheDocument();
  });
});
