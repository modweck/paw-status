import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DepositModal } from './DepositModal.jsx';

const createDepositIntent = vi.fn();

vi.mock('../api/payments.js', () => ({
  createDepositIntent: (...args) => createDepositIntent(...args),
}));

describe('DepositModal', () => {
  const mockSupabase = {};
  const mockOnPaid = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    createDepositIntent.mockReset();
    mockOnPaid.mockReset();
    mockOnClose.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the demo disclaimer label', () => {
    render(
      <DepositModal
        supabase={mockSupabase}
        appointmentId="apt-123"
        onPaid={mockOnPaid}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText('Demo payment — no real card is charged.')).toBeInTheDocument();
  });

  it('calls createDepositIntent when "Pay deposit" is clicked', async () => {
    createDepositIntent.mockResolvedValueOnce({ externalRef: 'ref-123' });

    render(
      <DepositModal
        supabase={mockSupabase}
        appointmentId="apt-123"
        onPaid={mockOnPaid}
        onClose={mockOnClose}
      />
    );

    const payButton = screen.getByRole('button', { name: /Pay deposit/i });
    fireEvent.click(payButton);

    await waitFor(() => {
      expect(createDepositIntent).toHaveBeenCalledWith(mockSupabase, 'apt-123');
    });
  });

  it('calls onPaid on successful payment', async () => {
    createDepositIntent.mockResolvedValueOnce({ externalRef: 'ref-123' });

    render(
      <DepositModal
        supabase={mockSupabase}
        appointmentId="apt-123"
        onPaid={mockOnPaid}
        onClose={mockOnClose}
      />
    );

    const payButton = screen.getByRole('button', { name: /Pay deposit/i });
    fireEvent.click(payButton);

    await waitFor(() => {
      expect(mockOnPaid).toHaveBeenCalled();
    });
  });

  it('renders inline error on failure without closing the modal', async () => {
    createDepositIntent.mockRejectedValueOnce(new Error('Payment failed'));

    render(
      <DepositModal
        supabase={mockSupabase}
        appointmentId="apt-123"
        onPaid={mockOnPaid}
        onClose={mockOnClose}
      />
    );

    const payButton = screen.getByRole('button', { name: /Pay deposit/i });
    fireEvent.click(payButton);

    await waitFor(() => {
      expect(screen.getByText('Payment failed')).toBeInTheDocument();
    });

    // Modal should still be visible
    expect(screen.getByText('Demo payment — no real card is charged.')).toBeInTheDocument();

    // onClose should not have been called
    expect(mockOnClose).not.toHaveBeenCalled();
  });
});
