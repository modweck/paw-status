import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BookingsListPanel } from './BookingsListPanel.jsx';

const loadCustomerBookingRequests = vi.fn();

vi.mock('../api/bookingRequests.js', () => ({
  loadCustomerBookingRequests: (...args) => loadCustomerBookingRequests(...args),
}));

vi.mock('../lib/supabaseClient.js', () => ({
  requireSupabaseClient: () => ({ from: () => null }),
}));

const customer = { id: 'customer-1', authUserId: 'auth-user-1' };

describe('BookingsListPanel', () => {
  beforeEach(() => {
    loadCustomerBookingRequests.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows an empty-state message after loading when the customer has no bookings', async () => {
    loadCustomerBookingRequests.mockResolvedValueOnce([]);

    render(<BookingsListPanel customer={customer} />);

    await waitFor(() => {
      expect(screen.getByText(/no booking requests yet/i)).toBeInTheDocument();
    });
    expect(
      screen.getByText(/haven't requested any groomings yet/i),
    ).toBeInTheDocument();
  });

  it('renders each booking with the groomer name, dog, service, and customer-facing status copy', async () => {
    loadCustomerBookingRequests.mockResolvedValueOnce([
      {
        id: 'request-1',
        status: 'requested',
        service: 'full-groom',
        createdAt: '2026-05-20T12:00:00.000Z',
        externalBookingUrl: '',
        groomer: { id: 'g-1', name: 'Jill', salon: 'Happy Tails' },
        dog: { id: 'd-1', name: 'Mochi' },
      },
      {
        id: 'request-2',
        status: 'external_handoff',
        service: 'bath',
        createdAt: '2026-05-19T12:00:00.000Z',
        externalBookingUrl: 'https://example.com/book',
        groomer: { id: 'g-2', name: 'Carlos', salon: 'Carlos' },
        dog: { id: 'd-1', name: 'Mochi' },
      },
    ]);

    render(<BookingsListPanel customer={customer} />);

    await waitFor(() => {
      expect(screen.getByText('Request sent')).toBeInTheDocument();
    });
    expect(screen.getByText('Jill at Happy Tails')).toBeInTheDocument();
    expect(screen.getByText('Carlos')).toBeInTheDocument();
    expect(
      screen.getByText(/Sent to the groomer's booking page/i),
    ).toBeInTheDocument();
    const externalLink = screen.getByRole('link', { name: /Open booking link/i });
    expect(externalLink).toHaveAttribute('href', 'https://example.com/book');
    expect(externalLink).toHaveAttribute('target', '_blank');
    expect(externalLink).toHaveAttribute('rel', expect.stringMatching(/noreferrer/));
  });

  it('shows an error message when the loader throws', async () => {
    loadCustomerBookingRequests.mockRejectedValueOnce(new Error('Network down'));

    render(<BookingsListPanel customer={customer} />);

    await waitFor(() => {
      expect(screen.getByText('Network down')).toBeInTheDocument();
    });
  });

  it('lets the user retry with the Refresh button', async () => {
    loadCustomerBookingRequests
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce([
        {
          id: 'request-3',
          status: 'confirmed',
          service: 'bath',
          createdAt: '2026-05-22T00:00:00.000Z',
          externalBookingUrl: '',
          groomer: { id: 'g-1', name: 'Jill', salon: null },
          dog: { id: 'd-1', name: 'Mochi' },
        },
      ]);

    render(<BookingsListPanel customer={customer} />);

    await waitFor(() => {
      expect(screen.getByText('Network down')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => {
      expect(screen.getByText('Confirmed')).toBeInTheDocument();
    });
    expect(screen.queryByText('Network down')).not.toBeInTheDocument();
  });

  it('does not attempt to load when no customer is supplied', () => {
    render(<BookingsListPanel customer={null} />);
    expect(loadCustomerBookingRequests).not.toHaveBeenCalled();
  });

  it('falls back to a prettified label for an unknown status without crashing', async () => {
    loadCustomerBookingRequests.mockResolvedValueOnce([
      {
        id: 'request-x',
        status: 'mystery_state',
        service: '',
        createdAt: '',
        externalBookingUrl: '',
        groomer: { id: 'g-1', name: 'Jill', salon: null },
        dog: { id: 'd-1', name: 'Mochi' },
      },
    ]);

    render(<BookingsListPanel customer={customer} />);

    await waitFor(() => {
      expect(screen.getByText('mystery_state')).toBeInTheDocument();
    });
  });
});
