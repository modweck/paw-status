import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SlotPicker } from './SlotPicker.jsx';

const fetchAvailableSlots = vi.fn();

vi.mock('../api/availability.js', () => ({
  fetchAvailableSlots: (...args) => fetchAvailableSlots(...args),
}));

describe('SlotPicker', () => {
  const supabase = { id: 'supabase-client' };
  const onPick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchAvailableSlots.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading state while fetching slots', () => {
    fetchAvailableSlots.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve([]), 100);
        }),
    );

    render(
      <SlotPicker
        groomerId="groomer-1"
        serviceId="service-1"
        supabase={supabase}
        onPick={onPick}
      />,
    );

    expect(screen.getByText('Loading available slots...')).toBeInTheDocument();
  });

  it('renders empty state when no slots are available', async () => {
    fetchAvailableSlots.mockResolvedValueOnce([]);

    render(
      <SlotPicker
        groomerId="groomer-1"
        serviceId="service-1"
        supabase={supabase}
        onPick={onPick}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('No available slots in the next 30 days')).toBeInTheDocument();
    });
  });

  it('renders slots grouped by calendar day', async () => {
    const mockSlots = [
      { slotId: 'slot-1', startTime: '2024-01-15T09:00:00Z' },
      { slotId: 'slot-2', startTime: '2024-01-15T10:00:00Z' },
      { slotId: 'slot-3', startTime: '2024-01-16T14:00:00Z' },
    ];

    fetchAvailableSlots.mockResolvedValueOnce(mockSlots);

    render(
      <SlotPicker
        groomerId="groomer-1"
        serviceId="service-1"
        supabase={supabase}
        onPick={onPick}
      />,
    );

    await waitFor(() => {
      // Should have 2 day groups (Jan 15 and Jan 16)
      const dayLabels = screen.getAllByRole('heading', { level: 3 });
      expect(dayLabels).toHaveLength(2);
    });

    // Verify slots are rendered
    const buttons = screen.getAllByRole('button', { type: 'button' });
    expect(buttons).toHaveLength(3);
  });

  it('calls onPick with the correct slot when a slot is clicked', async () => {
    const mockSlots = [
      { slotId: 'slot-1', startTime: '2024-01-15T09:00:00Z' },
      { slotId: 'slot-2', startTime: '2024-01-15T10:00:00Z' },
    ];

    fetchAvailableSlots.mockResolvedValueOnce(mockSlots);

    render(
      <SlotPicker
        groomerId="groomer-1"
        serviceId="service-1"
        supabase={supabase}
        onPick={onPick}
      />,
    );

    await waitFor(() => {
      const buttons = screen.getAllByRole('button', { type: 'button' });
      expect(buttons).toHaveLength(2);
    });

    const buttons = screen.getAllByRole('button', { type: 'button' });
    fireEvent.click(buttons[0]);

    expect(onPick).toHaveBeenCalledWith(mockSlots[0]);
  });

  it('fetches slots with correct date range (30 days from today)', async () => {
    const mockSlots = [{ slotId: 'slot-1', startTime: '2024-01-15T09:00:00Z' }];
    fetchAvailableSlots.mockResolvedValueOnce(mockSlots);

    render(
      <SlotPicker
        groomerId="groomer-1"
        serviceId="service-1"
        supabase={supabase}
        onPick={onPick}
      />,
    );

    await waitFor(() => {
      expect(fetchAvailableSlots).toHaveBeenCalledWith(
        expect.objectContaining({
          groomerId: 'groomer-1',
          serviceId: 'service-1',
          from: expect.stringMatching(/\d{4}-\d{2}-\d{2}/),
          to: expect.stringMatching(/\d{4}-\d{2}-\d{2}/),
        }),
      );
    });

    const call = fetchAvailableSlots.mock.calls[0][0];
    const fromDate = new Date(call.from);
    const toDate = new Date(call.to);
    const diffInDays = (toDate - fromDate) / (1000 * 60 * 60 * 24);

    expect(diffInDays).toBeGreaterThanOrEqual(29);
    expect(diffInDays).toBeLessThanOrEqual(30);
  });

  it('re-fetches slots when groomerId changes', async () => {
    const mockSlots = [{ slotId: 'slot-1', startTime: '2024-01-15T09:00:00Z' }];
    fetchAvailableSlots.mockResolvedValue(mockSlots);

    const { rerender } = render(
      <SlotPicker
        groomerId="groomer-1"
        serviceId="service-1"
        supabase={supabase}
        onPick={onPick}
      />,
    );

    await waitFor(() => {
      expect(fetchAvailableSlots).toHaveBeenCalledTimes(1);
    });

    rerender(
      <SlotPicker
        groomerId="groomer-2"
        serviceId="service-1"
        supabase={supabase}
        onPick={onPick}
      />,
    );

    await waitFor(() => {
      expect(fetchAvailableSlots).toHaveBeenCalledTimes(2);
      expect(fetchAvailableSlots).toHaveBeenLastCalledWith(
        expect.objectContaining({
          groomerId: 'groomer-2',
        }),
      );
    });
  });

  it('re-fetches slots when serviceId changes', async () => {
    const mockSlots = [{ slotId: 'slot-1', startTime: '2024-01-15T09:00:00Z' }];
    fetchAvailableSlots.mockResolvedValue(mockSlots);

    const { rerender } = render(
      <SlotPicker
        groomerId="groomer-1"
        serviceId="service-1"
        supabase={supabase}
        onPick={onPick}
      />,
    );

    await waitFor(() => {
      expect(fetchAvailableSlots).toHaveBeenCalledTimes(1);
    });

    rerender(
      <SlotPicker
        groomerId="groomer-1"
        serviceId="service-2"
        supabase={supabase}
        onPick={onPick}
      />,
    );

    await waitFor(() => {
      expect(fetchAvailableSlots).toHaveBeenCalledTimes(2);
      expect(fetchAvailableSlots).toHaveBeenLastCalledWith(
        expect.objectContaining({
          serviceId: 'service-2',
        }),
      );
    });
  });

  it('does not fetch if groomerId is missing', async () => {
    render(
      <SlotPicker
        groomerId=""
        serviceId="service-1"
        supabase={supabase}
        onPick={onPick}
      />,
    );

    await waitFor(() => {
      expect(fetchAvailableSlots).not.toHaveBeenCalled();
    });
  });

  it('does not fetch if serviceId is missing', async () => {
    render(
      <SlotPicker
        groomerId="groomer-1"
        serviceId=""
        supabase={supabase}
        onPick={onPick}
      />,
    );

    await waitFor(() => {
      expect(fetchAvailableSlots).not.toHaveBeenCalled();
    });
  });

  it('shows empty state when fetch fails', async () => {
    fetchAvailableSlots.mockRejectedValueOnce(new Error('Network error'));

    render(
      <SlotPicker
        groomerId="groomer-1"
        serviceId="service-1"
        supabase={supabase}
        onPick={onPick}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('No available slots in the next 30 days')).toBeInTheDocument();
    });
  });

  it('sorts day groups chronologically', async () => {
    const mockSlots = [
      { slotId: 'slot-1', startTime: '2024-01-16T09:00:00Z' },
      { slotId: 'slot-2', startTime: '2024-01-15T09:00:00Z' },
    ];

    fetchAvailableSlots.mockResolvedValueOnce(mockSlots);

    render(
      <SlotPicker
        groomerId="groomer-1"
        serviceId="service-1"
        supabase={supabase}
        onPick={onPick}
      />,
    );

    await waitFor(() => {
      const dayLabels = screen.getAllByRole('heading', { level: 3 });
      expect(dayLabels).toHaveLength(2);

      // First heading should be Jan 15, second should be Jan 16
      const firstDateText = dayLabels[0].textContent;
      const secondDateText = dayLabels[1].textContent;

      // Parse dates to compare
      const firstDate = new Date(firstDateText);
      const secondDate = new Date(secondDateText);
      expect(firstDate.getTime()).toBeLessThan(secondDate.getTime());
    });
  });
});
