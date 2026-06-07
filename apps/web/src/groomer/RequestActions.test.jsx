import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestActions } from './RequestActions.jsx';

const confirmRequest = vi.fn();
const declineRequest = vi.fn();
const fetchAvailableSlots = vi.fn();

vi.mock('../api/appointments.js', () => ({
  confirmRequest: (...args) => confirmRequest(...args),
  declineRequest: (...args) => declineRequest(...args),
}));

vi.mock('../customer/SlotPicker.jsx', () => ({
  SlotPicker: ({ groomerId, serviceId, onPick }) => (
    <div className="slot-picker-mock">
      <button
        className="slot-picker-slot"
        onClick={() =>
          onPick({
            slotId: 'slot-1',
            startTime: '2024-01-15T09:00:00Z',
          })
        }
        type="button"
      >
        9:00 AM
      </button>
    </div>
  ),
}));

describe('RequestActions', () => {
  const supabase = { id: 'supabase-client' };
  const request = {
    id: 'request-1',
    groomerId: 'groomer-1',
    dogId: 'dog-1',
    service: 'bath-brush',
    customerId: 'customer-1',
    status: 'requested',
  };
  const onAction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    confirmRequest.mockReset().mockResolvedValue(undefined);
    declineRequest.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders both Accept and Decline buttons', () => {
    render(
      <RequestActions
        request={request}
        supabase={supabase}
        onAction={onAction}
      />,
    );

    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
  });

  it('shows slot picker when Accept is clicked', async () => {
    render(
      <RequestActions
        request={request}
        supabase={supabase}
        onAction={onAction}
      />,
    );

    const acceptButton = screen.getByRole('button', { name: 'Accept' });
    fireEvent.click(acceptButton);

    await waitFor(() => {
      expect(screen.getByText('9:00 AM')).toBeInTheDocument();
    });
  });

  it('calls declineRequest when Decline is clicked', async () => {
    render(
      <RequestActions
        request={request}
        supabase={supabase}
        onAction={onAction}
      />,
    );

    const declineButton = screen.getByRole('button', { name: 'Decline' });
    fireEvent.click(declineButton);

    await waitFor(() => {
      expect(declineRequest).toHaveBeenCalledWith(supabase, request.id);
    });
  });

  it('calls onAction after successful decline', async () => {
    declineRequest.mockResolvedValueOnce(undefined);

    render(
      <RequestActions
        request={request}
        supabase={supabase}
        onAction={onAction}
      />,
    );

    const declineButton = screen.getByRole('button', { name: 'Decline' });
    fireEvent.click(declineButton);

    await waitFor(() => {
      expect(onAction).toHaveBeenCalled();
    });
  });

  it('calls confirmRequest when a slot is picked after Accept', async () => {
    render(
      <RequestActions
        request={request}
        supabase={supabase}
        onAction={onAction}
      />,
    );

    const acceptButton = screen.getByRole('button', { name: 'Accept' });
    fireEvent.click(acceptButton);

    await waitFor(() => {
      expect(screen.getByText('9:00 AM')).toBeInTheDocument();
    });

    const slotButton = screen.getByText('9:00 AM');
    fireEvent.click(slotButton);

    await waitFor(() => {
      expect(confirmRequest).toHaveBeenCalledWith(
        supabase,
        request.id,
        '2024-01-15T09:00:00Z',
      );
    });
  });

  it('renders inline error when slot is taken', async () => {
    confirmRequest.mockRejectedValueOnce(
      new Error('That time was just booked'),
    );

    render(
      <RequestActions
        request={request}
        supabase={supabase}
        onAction={onAction}
      />,
    );

    const acceptButton = screen.getByRole('button', { name: 'Accept' });
    fireEvent.click(acceptButton);

    await waitFor(() => {
      expect(screen.getByText('9:00 AM')).toBeInTheDocument();
    });

    const slotButton = screen.getByText('9:00 AM');
    fireEvent.click(slotButton);

    await waitFor(() => {
      expect(screen.getByText('That time was just booked. Please select another slot.')).toBeInTheDocument();
    });

    // Verify the slot picker is still visible (component not unmounted)
    expect(screen.getByText('9:00 AM')).toBeInTheDocument();
  });

  it('renders generic error inline', async () => {
    declineRequest.mockRejectedValueOnce(new Error('Network error'));

    render(
      <RequestActions
        request={request}
        supabase={supabase}
        onAction={onAction}
      />,
    );

    const declineButton = screen.getByRole('button', { name: 'Decline' });
    fireEvent.click(declineButton);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('disables buttons while loading', async () => {
    const slowDecline = vi.fn(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(), 100);
        }),
    );
    declineRequest.mockImplementation(slowDecline);

    render(
      <RequestActions
        request={request}
        supabase={supabase}
        onAction={onAction}
      />,
    );

    const declineButton = screen.getByRole('button', { name: 'Decline' });
    const acceptButton = screen.getByRole('button', { name: 'Accept' });

    fireEvent.click(declineButton);

    await waitFor(() => {
      expect(acceptButton).toBeDisabled();
    });
  });

  it('can go back from slot picker without making a request', async () => {
    render(
      <RequestActions
        request={request}
        supabase={supabase}
        onAction={onAction}
      />,
    );

    const acceptButton = screen.getByRole('button', { name: 'Accept' });
    fireEvent.click(acceptButton);

    await waitFor(() => {
      expect(screen.getByText('9:00 AM')).toBeInTheDocument();
    });

    const backButton = screen.getByRole('button', { name: 'Back' });
    fireEvent.click(backButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
    });

    expect(confirmRequest).not.toHaveBeenCalled();
  });
});
