import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminVerificationPanel } from './AdminVerificationPanel.jsx';

const loadPendingAdminAccessRequests = vi.fn();
const loadPendingGroomerMembershipClaims = vi.fn();
const reviewAdminAccessRequest = vi.fn();
const reviewGroomerMembershipClaim = vi.fn();
const useAuth = vi.fn();

vi.mock('../auth/AuthProvider.jsx', () => ({
  useAuth: () => useAuth(),
}));

vi.mock('../auth/LoginPanel.jsx', () => ({
  LoginPanel: ({ title }) => <div>{title}</div>,
}));

vi.mock('../api/adminVerification.js', () => ({
  loadPendingAdminAccessRequests: (...args) => loadPendingAdminAccessRequests(...args),
  loadPendingGroomerMembershipClaims: (...args) => loadPendingGroomerMembershipClaims(...args),
  reviewAdminAccessRequest: (...args) => reviewAdminAccessRequest(...args),
  reviewGroomerMembershipClaim: (...args) => reviewGroomerMembershipClaim(...args),
}));

describe('AdminVerificationPanel', () => {
  afterEach(() => {
    loadPendingAdminAccessRequests.mockReset();
    loadPendingGroomerMembershipClaims.mockReset();
    reviewAdminAccessRequest.mockReset();
    reviewGroomerMembershipClaim.mockReset();
    useAuth.mockReset();
  });

  it('shows an admin-specific login when signed out', () => {
    useAuth.mockReturnValue({ loading: false, user: null });

    render(<AdminVerificationPanel />);

    expect(screen.getByText('Admin sign in')).toBeInTheDocument();
    expect(screen.getByText('Admin login')).toBeInTheDocument();
  });

  it('shows the admin dashboard sections when signed in', () => {
    useAuth.mockReturnValue({
      loading: false,
      user: { id: 'admin-user-1', email: 'admin@pawstatus.example' },
    });

    render(<AdminVerificationPanel />);

    expect(screen.getByText('Admin dashboard')).toBeInTheDocument();
    expect(screen.getByText('admin@pawstatus.example')).toBeInTheDocument();
    expect(screen.getByText('Groomer claim review')).toBeInTheDocument();
    expect(screen.getByText('Admin access review')).toBeInTheDocument();
  });

  it('loads and approves pending groomer claims through the admin API adapter', async () => {
    useAuth.mockReturnValue({
      loading: false,
      session: { access_token: 'admin-token' },
      user: { id: 'admin-user-1', email: 'admin@pawstatus.example' },
    });
    loadPendingGroomerMembershipClaims.mockResolvedValueOnce({
      claims: [
        {
          id: 'membership-1',
          account: { email: 'owner@example.com' },
          groomer: { name: 'Paw House', address: '123 Main St' },
        },
      ],
    });
    reviewGroomerMembershipClaim.mockResolvedValueOnce({ status: 'verified' });

    render(<AdminVerificationPanel />);

    const section = screen.getByText('Groomer claim review').closest('section');
    fireEvent.click(within(section).getByRole('button', { name: 'Load' }));

    await waitFor(() => {
      expect(screen.getByText('Paw House')).toBeInTheDocument();
    });

    fireEvent.click(within(section).getByRole('button', { name: 'Approve' }));

    await waitFor(() => {
      expect(reviewGroomerMembershipClaim).toHaveBeenCalledWith('membership-1', 'verify', {
        accessToken: 'admin-token',
      });
    });
  });

  it('loads and denies pending admin access requests through the admin API adapter', async () => {
    useAuth.mockReturnValue({
      loading: false,
      session: { access_token: 'admin-token' },
      user: { id: 'admin-user-1', email: 'admin@pawstatus.example' },
    });
    loadPendingAdminAccessRequests.mockResolvedValueOnce({
      requests: [
        {
          id: 'admin-request-1',
          email: 'candidate@example.com',
          reason: 'Operations coverage',
        },
      ],
    });
    reviewAdminAccessRequest.mockResolvedValueOnce({ status: 'denied' });

    render(<AdminVerificationPanel />);

    const section = screen.getByText('Admin access review').closest('section');
    fireEvent.click(within(section).getByRole('button', { name: 'Load' }));

    await waitFor(() => {
      expect(screen.getByText('candidate@example.com')).toBeInTheDocument();
    });

    fireEvent.click(within(section).getByRole('button', { name: 'Deny' }));

    await waitFor(() => {
      expect(reviewAdminAccessRequest).toHaveBeenCalledWith('admin-request-1', 'deny', {
        accessToken: 'admin-token',
      });
    });
  });
});
