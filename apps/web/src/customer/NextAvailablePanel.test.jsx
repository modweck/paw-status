import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NextAvailablePanel } from './NextAvailablePanel.jsx';

const fetchNextAvailable = vi.fn();
const joinWaitlist = vi.fn();

vi.mock('../api/waitlist.js', () => ({
  fetchNextAvailable: (...args) => fetchNextAvailable(...args),
  joinWaitlist: (...args) => joinWaitlist(...args),
}));

vi.mock('../lib/supabaseClient.js', () => ({
  requireSupabaseClient: () => ({ from: () => null }),
}));

const customer = { id: 'customer-1', authUserId: 'auth-user-1' };
const location = { lat: 40.768, lng: -73.958, address: 'NYC' };
const selectedService = { id: 'full-groom', name: 'Full groom' };

describe('NextAvailablePanel', () => {
  beforeEach(() => {
    fetchNextAvailable.mockReset();
    joinWaitlist.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls fetchNextAvailable when the Search button is clicked', async () => {
    fetchNextAvailable.mockResolvedValueOnce([]);

    render(
      <NextAvailablePanel
        customer={customer}
        location={location}
        selectedService={selectedService}
      />,
    );

    const searchButton = screen.getByRole('button', { name: /search/i });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(fetchNextAvailable).toHaveBeenCalledWith(
        expect.objectContaining({
          lat: location.lat,
          lng: location.lng,
          serviceId: selectedService.id,
        }),
      );
    });
  });

  it('renders search results when available', async () => {
    fetchNextAvailable.mockResolvedValueOnce([
      {
        slotAt: '2026-06-10T14:00:00.000Z',
        groomerId: 'g-1',
        groomerName: 'Jill',
      },
      {
        slotAt: '2026-06-10T16:00:00.000Z',
        groomerId: 'g-2',
        groomerName: 'Carlos',
      },
    ]);

    render(
      <NextAvailablePanel
        customer={customer}
        location={location}
        selectedService={selectedService}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    await waitFor(() => {
      expect(screen.getByText('Jill')).toBeInTheDocument();
      expect(screen.getByText('Carlos')).toBeInTheDocument();
    });
  });

  it('shows an empty state when no results are found', async () => {
    fetchNextAvailable.mockResolvedValueOnce([]);

    render(
      <NextAvailablePanel
        customer={customer}
        location={location}
        selectedService={selectedService}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    await waitFor(() => {
      expect(screen.getByText(/no available slots found/i)).toBeInTheDocument();
    });
  });

  it('shows an error when the search fails', async () => {
    fetchNextAvailable.mockRejectedValueOnce(new Error('Network error'));

    render(
      <NextAvailablePanel
        customer={customer}
        location={location}
        selectedService={selectedService}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('calls joinWaitlist when the Notify me button is clicked', async () => {
    joinWaitlist.mockResolvedValueOnce({
      id: 'entry-1',
      customerId: customer.id,
    });

    render(
      <NextAvailablePanel
        customer={customer}
        location={location}
        selectedService={selectedService}
      />,
    );

    const notifyButton = screen.getByRole('button', { name: /notify me/i });
    fireEvent.click(notifyButton);

    await waitFor(() => {
      expect(joinWaitlist).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          customerId: customer.id,
          serviceId: selectedService.id,
          groomerId: null,
        }),
      );
    });
  });

  it('shows a success message after joining the waitlist', async () => {
    joinWaitlist.mockResolvedValueOnce({
      id: 'entry-1',
      customerId: customer.id,
    });

    render(
      <NextAvailablePanel
        customer={customer}
        location={location}
        selectedService={selectedService}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /notify me/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/you're on the waitlist/i),
      ).toBeInTheDocument();
    });
  });

  it('shows an error when joining the waitlist fails', async () => {
    joinWaitlist.mockRejectedValueOnce(new Error('Database error'));

    render(
      <NextAvailablePanel
        customer={customer}
        location={location}
        selectedService={selectedService}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /notify me/i }));

    await waitFor(() => {
      expect(screen.getByText('Database error')).toBeInTheDocument();
    });
  });

  it('shows an error when no location is provided for search', async () => {
    render(
      <NextAvailablePanel
        customer={customer}
        location={null}
        selectedService={selectedService}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    await waitFor(() => {
      expect(screen.getByText(/please provide a location/i)).toBeInTheDocument();
    });
  });

  it('shows an error when no service is selected for search', async () => {
    render(
      <NextAvailablePanel
        customer={customer}
        location={location}
        selectedService={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    await waitFor(() => {
      expect(screen.getByText(/please select a service/i)).toBeInTheDocument();
    });
  });

  it('shows an error when not logged in for waitlist', async () => {
    render(
      <NextAvailablePanel
        customer={null}
        location={location}
        selectedService={selectedService}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /notify me/i }));

    await waitFor(() => {
      expect(screen.getByText(/please log in/i)).toBeInTheDocument();
    });
  });
});
