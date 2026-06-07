import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WaitlistOffers } from './WaitlistOffers.jsx';

const loadMyOffers = vi.fn();
const claimOffer = vi.fn();

vi.mock('../api/waitlist.js', () => ({
  loadMyOffers: (...args) => loadMyOffers(...args),
  claimOffer: (...args) => claimOffer(...args),
}));

const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
  })),
  rpc: vi.fn(),
};

describe('WaitlistOffers', () => {
  beforeEach(() => {
    loadMyOffers.mockReset();
    claimOffer.mockReset();
    vi.clearAllMocks();

    // Setup default mock behavior
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads and renders offers on mount', async () => {
    loadMyOffers.mockResolvedValueOnce([
      {
        id: 'offer-1',
        entryId: 'entry-1',
        groomerId: 'g-1',
        serviceId: 'full-groom',
        slotAt: '2026-06-10T14:00:00.000Z',
        expiresAt: '2026-06-10T13:00:00.000Z',
        status: 'pending',
      },
      {
        id: 'offer-2',
        entryId: 'entry-1',
        groomerId: 'g-2',
        serviceId: 'bath-brush',
        slotAt: '2026-06-10T16:00:00.000Z',
        expiresAt: '2026-06-10T15:00:00.000Z',
        status: 'pending',
      },
    ]);

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValueOnce({ data: { id: 'g-1', name: 'Jill' } })
        .mockResolvedValueOnce({ data: { id: 'g-2', name: 'Carlos' } }),
    });

    render(<WaitlistOffers supabase={mockSupabase} />);

    await waitFor(() => {
      expect(loadMyOffers).toHaveBeenCalledWith(mockSupabase);
    });

    await waitFor(() => {
      expect(screen.getByText('Jill')).toBeInTheDocument();
      expect(screen.getByText('Carlos')).toBeInTheDocument();
    });
  });

  it('shows an empty state when there are no offers', async () => {
    loadMyOffers.mockResolvedValueOnce([]);

    render(<WaitlistOffers supabase={mockSupabase} />);

    await waitFor(() => {
      expect(screen.getByText(/don't have any waitlist offers yet/i)).toBeInTheDocument();
    });
  });

  it('shows an error message when loading fails', async () => {
    loadMyOffers.mockRejectedValueOnce(new Error('Database error'));

    render(<WaitlistOffers supabase={mockSupabase} />);

    await waitFor(() => {
      expect(screen.getByText('Database error')).toBeInTheDocument();
    });
  });

  it('calls claimOffer when the Claim button is clicked', async () => {
    loadMyOffers.mockResolvedValueOnce([
      {
        id: 'offer-1',
        entryId: 'entry-1',
        groomerId: 'g-1',
        serviceId: 'full-groom',
        slotAt: '2026-06-10T14:00:00.000Z',
        expiresAt: '2026-06-10T13:00:00.000Z',
        status: 'pending',
      },
    ]);

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'g-1', name: 'Jill' } }),
    });

    claimOffer.mockResolvedValueOnce('appointment-1');

    render(<WaitlistOffers supabase={mockSupabase} />);

    await waitFor(() => {
      expect(screen.getByText('Jill')).toBeInTheDocument();
    });

    const claimButton = screen.getByRole('button', { name: /claim/i });
    fireEvent.click(claimButton);

    await waitFor(() => {
      expect(claimOffer).toHaveBeenCalledWith(mockSupabase, 'offer-1');
    });
  });

  it('removes offer from the list after successful claim', async () => {
    loadMyOffers.mockResolvedValueOnce([
      {
        id: 'offer-1',
        entryId: 'entry-1',
        groomerId: 'g-1',
        serviceId: 'full-groom',
        slotAt: '2026-06-10T14:00:00.000Z',
        expiresAt: '2026-06-10T13:00:00.000Z',
        status: 'pending',
      },
    ]);

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'g-1', name: 'Jill' } }),
    });

    claimOffer.mockResolvedValueOnce('appointment-1');

    render(<WaitlistOffers supabase={mockSupabase} />);

    await waitFor(() => {
      expect(screen.getByText('Jill')).toBeInTheDocument();
    });

    const claimButton = screen.getByRole('button', { name: /claim/i });
    fireEvent.click(claimButton);

    await waitFor(() => {
      expect(claimButton).not.toBeInTheDocument();
    });
  });

  it('shows an error message when claiming fails', async () => {
    loadMyOffers.mockResolvedValueOnce([
      {
        id: 'offer-1',
        entryId: 'entry-1',
        groomerId: 'g-1',
        serviceId: 'full-groom',
        slotAt: '2026-06-10T14:00:00.000Z',
        expiresAt: '2026-06-10T13:00:00.000Z',
        status: 'pending',
      },
    ]);

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'g-1', name: 'Jill' } }),
    });

    claimOffer.mockRejectedValueOnce(new Error('Claim failed'));

    render(<WaitlistOffers supabase={mockSupabase} />);

    await waitFor(() => {
      expect(screen.getByText('Jill')).toBeInTheDocument();
    });

    const claimButton = screen.getByRole('button', { name: /claim/i });
    fireEvent.click(claimButton);

    await waitFor(() => {
      expect(screen.getByText('Claim failed')).toBeInTheDocument();
    });
  });

  it('lets the user retry with the Refresh button', async () => {
    loadMyOffers
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'offer-1',
          entryId: 'entry-1',
          groomerId: 'g-1',
          serviceId: 'full-groom',
          slotAt: '2026-06-10T14:00:00.000Z',
          expiresAt: '2026-06-10T13:00:00.000Z',
          status: 'pending',
        },
      ]);

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'g-1', name: 'Jill' } }),
    });

    render(<WaitlistOffers supabase={mockSupabase} />);

    await waitFor(() => {
      expect(screen.getByText(/don't have any waitlist offers yet/i)).toBeInTheDocument();
    });

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(screen.getByText('Jill')).toBeInTheDocument();
    });
    expect(loadMyOffers).toHaveBeenCalledTimes(2);
  });

  it('renders the service name for each offer', async () => {
    loadMyOffers.mockResolvedValueOnce([
      {
        id: 'offer-1',
        entryId: 'entry-1',
        groomerId: 'g-1',
        serviceId: 'full-groom',
        slotAt: '2026-06-10T14:00:00.000Z',
        expiresAt: '2026-06-10T13:00:00.000Z',
        status: 'pending',
      },
    ]);

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'g-1', name: 'Jill' } }),
    });

    render(<WaitlistOffers supabase={mockSupabase} />);

    await waitFor(() => {
      expect(screen.getByText('Full groom')).toBeInTheDocument();
    });
  });

  it('does not load offers when supabase is not provided', () => {
    render(<WaitlistOffers supabase={null} />);
    expect(loadMyOffers).not.toHaveBeenCalled();
  });
});
