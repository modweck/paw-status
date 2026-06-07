import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StaffDashboard } from './StaffDashboard.jsx';

const createGroomerAccountForVerifiedUser = vi.fn();
const isStaffDashboardEnabled = vi.fn();
const loadGroomerWorkspaceForVerifiedUser = vi.fn();
const requireSupabaseClient = vi.fn();
const requestGroomerMembership = vi.fn();
const searchClaimableGroomers = vi.fn();
const updateOwnedAppointmentRequestStatus = vi.fn();
const useAuth = vi.fn();

vi.mock('../config/featureFlags.js', () => ({
  isStaffDashboardEnabled: () => isStaffDashboardEnabled(),
}));

vi.mock('../auth/AuthProvider.jsx', () => ({
  useAuth: () => useAuth(),
}));

vi.mock('../auth/LoginPanel.jsx', () => ({
  LoginPanel: () => <div>Magic link sign in</div>,
}));

vi.mock('../lib/supabaseClient.js', () => ({
  requireSupabaseClient: () => requireSupabaseClient(),
}));

vi.mock('../api/groomerAccounts.js', () => ({
  createGroomerAccountForVerifiedUser: (...args) => createGroomerAccountForVerifiedUser(...args),
  loadGroomerWorkspaceForVerifiedUser: (...args) => loadGroomerWorkspaceForVerifiedUser(...args),
  requestGroomerMembership: (...args) => requestGroomerMembership(...args),
  searchClaimableGroomers: (...args) => searchClaimableGroomers(...args),
  updateOwnedAppointmentRequestStatus: (...args) => updateOwnedAppointmentRequestStatus(...args),
}));

const supabase = { id: 'supabase-client' };
const user = { id: 'auth-groomer-1', email: 'owner@pawhouse.example' };

const workspace = {
  user,
  account: {
    id: 'groomer-account-1',
    authUserId: user.id,
    name: 'Alex Groomer',
    email: user.email,
    phone: '+12125551212',
  },
  memberships: [
    {
      id: 'membership-1',
      groomerAccountId: 'groomer-account-1',
      groomerId: 'groomer-1',
      role: 'owner',
      status: 'verified',
      groomer: {
        id: 'groomer-1',
        name: 'Paw House',
        salon: 'Paw House',
        website: 'https://pawhouse.example/book',
      },
    },
  ],
  verifiedMemberships: [
    {
      id: 'membership-1',
      groomerId: 'groomer-1',
      status: 'verified',
      groomer: {
        id: 'groomer-1',
        name: 'Paw House',
        salon: 'Paw House',
        website: 'https://pawhouse.example/book',
      },
    },
  ],
  requests: [
    {
      id: 'request-1',
      groomerId: 'groomer-1',
      service: 'full-groom',
      preferredWindows: ['weekday-evening'],
      customerNotes: 'Text before confirming.',
      status: 'requested',
      externalBookingUrl: '',
      dog: {
        name: 'Mochi',
        breed: 'Shih Tzu',
        size: 'small',
        notes: 'Nervous with dryers.',
      },
      customer: {
        name: 'Jamie',
        email: 'jamie@example.com',
        phone: '+12125551111',
      },
      groomer: {
        name: 'Paw House',
        website: 'https://pawhouse.example/book',
      },
    },
  ],
  bookingChannels: [
    {
      id: 'channel-1',
      groomerId: 'groomer-1',
      provider: 'website',
      label: 'Website booking',
      url: 'https://pawhouse.example/book',
      priority: 1,
      isActive: true,
    },
  ],
  calendarConnections: [
    {
      id: 'calendar-1',
      groomerId: 'groomer-1',
      provider: 'google_calendar',
      status: 'connected',
      externalAccountLabel: 'owner@pawhouse.example',
    },
  ],
};

describe('StaffDashboard', () => {
  afterEach(() => {
    createGroomerAccountForVerifiedUser.mockReset();
    isStaffDashboardEnabled.mockReset();
    loadGroomerWorkspaceForVerifiedUser.mockReset();
    requireSupabaseClient.mockReset();
    requestGroomerMembership.mockReset();
    searchClaimableGroomers.mockReset();
    updateOwnedAppointmentRequestStatus.mockReset();
    useAuth.mockReset();
  });

  it('keeps request handling gated but still opens groomer onboarding when the feature flag is off', () => {
    isStaffDashboardEnabled.mockReturnValue(false);
    useAuth.mockReturnValue({ loading: false, user: null });

    render(<StaffDashboard />);

    expect(screen.getByText('Groomer sign in')).toBeInTheDocument();
    expect(screen.getByText('Magic link sign in')).toBeInTheDocument();
    expect(loadGroomerWorkspaceForVerifiedUser).not.toHaveBeenCalled();
  });

  it('lets a signed-in groomer start onboarding while request handling is gated', async () => {
    isStaffDashboardEnabled.mockReturnValue(false);
    useAuth.mockReturnValue({ loading: false, user });
    requireSupabaseClient.mockReturnValue(supabase);
    loadGroomerWorkspaceForVerifiedUser.mockResolvedValueOnce({
      user,
      account: null,
      memberships: [],
      verifiedMemberships: [],
      requests: [],
      bookingChannels: [],
      calendarConnections: [],
    });

    render(<StaffDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Create groomer account')).toBeInTheDocument();
    });
    expect(loadGroomerWorkspaceForVerifiedUser).toHaveBeenCalledWith(supabase, {
      includeRequestHandling: false,
    });
  });

  it('requires sign in when the dashboard flag is enabled', () => {
    isStaffDashboardEnabled.mockReturnValue(true);
    useAuth.mockReturnValue({ loading: false, user: null });

    render(<StaffDashboard />);

    expect(screen.getByText('Groomer sign in')).toBeInTheDocument();
    expect(screen.getByText('Magic link sign in')).toBeInTheDocument();
  });

  it('lets a signed-in groomer create their account before handling requests', async () => {
    isStaffDashboardEnabled.mockReturnValue(true);
    useAuth.mockReturnValue({ loading: false, user });
    requireSupabaseClient.mockReturnValue(supabase);
    loadGroomerWorkspaceForVerifiedUser.mockResolvedValueOnce({
      user,
      account: null,
      memberships: [],
      verifiedMemberships: [],
      requests: [],
      bookingChannels: [],
      calendarConnections: [],
    });
    createGroomerAccountForVerifiedUser.mockResolvedValueOnce(workspace.account);

    render(<StaffDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Create groomer account')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Alex Groomer' },
    });
    fireEvent.change(screen.getByLabelText('Phone'), {
      target: { value: '+12125551212' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(createGroomerAccountForVerifiedUser).toHaveBeenCalledWith(supabase, {
        name: 'Alex Groomer',
        phone: '+12125551212',
      });
    });
  });

  it('renders the request created-at date in the packet when present', async () => {
    isStaffDashboardEnabled.mockReturnValue(true);
    useAuth.mockReturnValue({ loading: false, user });
    requireSupabaseClient.mockReturnValue(supabase);
    loadGroomerWorkspaceForVerifiedUser.mockResolvedValueOnce({
      ...workspace,
      requests: [
        {
          ...workspace.requests[0],
          createdAt: '2026-05-20T12:00:00.000Z',
        },
      ],
    });

    render(<StaffDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Mochi')).toBeInTheDocument();
    });
    expect(screen.getByText('1 pending requests')).toBeInTheDocument();
  });

  it('shows appointment requests with RequestActions', async () => {
    isStaffDashboardEnabled.mockReturnValue(true);
    useAuth.mockReturnValue({ loading: false, user });
    requireSupabaseClient.mockReturnValue(supabase);
    loadGroomerWorkspaceForVerifiedUser.mockResolvedValueOnce(workspace);

    render(<StaffDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Mochi')).toBeInTheDocument();
    });
    expect(screen.getByText('Jamie')).toBeInTheDocument();
    expect(screen.getByText('1 pending requests')).toBeInTheDocument();
  });

  it('shows owned appointment requests with RequestActions for Accept and Decline', async () => {
    isStaffDashboardEnabled.mockReturnValue(true);
    useAuth.mockReturnValue({ loading: false, user });
    requireSupabaseClient.mockReturnValue(supabase);
    loadGroomerWorkspaceForVerifiedUser.mockResolvedValueOnce(workspace);

    render(<StaffDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Mochi')).toBeInTheDocument();
    });

    expect(screen.getByText('Jamie')).toBeInTheDocument();
    expect(screen.getByText('owner@pawhouse.example')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
  });

  it('lets a groomer request a pending claim for a public groomer profile', async () => {
    isStaffDashboardEnabled.mockReturnValue(true);
    useAuth.mockReturnValue({ loading: false, user });
    requireSupabaseClient.mockReturnValue(supabase);
    loadGroomerWorkspaceForVerifiedUser.mockResolvedValueOnce({
      ...workspace,
      memberships: [],
      verifiedMemberships: [],
      requests: [],
      bookingChannels: [],
      calendarConnections: [],
    });
    searchClaimableGroomers.mockResolvedValueOnce([
      {
        id: 'groomer-1',
        name: 'Paw House',
        salon: 'Paw House',
        address: '515 E 72nd St',
      },
    ]);
    requestGroomerMembership.mockResolvedValueOnce({
      id: 'membership-1',
      groomerAccountId: workspace.account.id,
      groomerId: 'groomer-1',
      role: 'owner',
      status: 'pending',
      groomer: {
        id: 'groomer-1',
        name: 'Paw House',
      },
    });

    render(<StaffDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Claim a groomer profile')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Groomer name'), {
      target: { value: 'Paw' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search profiles' }));

    await waitFor(() => {
      expect(searchClaimableGroomers).toHaveBeenCalledWith(supabase, 'Paw');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Request claim' }));

    await waitFor(() => {
      expect(requestGroomerMembership).toHaveBeenCalledWith(
        supabase,
        workspace.account,
        'groomer-1',
      );
    });
    expect(screen.getByText('Pending review')).toBeInTheDocument();
  });

});
