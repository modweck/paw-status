import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GbpConnectButton } from './GbpConnectButton.jsx';

const connectGbp = vi.fn();

vi.mock('../api/gbp.js', () => ({
  connectGbp: (...args) => connectGbp(...args),
}));

describe('GbpConnectButton', () => {
  const mockSupabase = {};

  beforeEach(() => {
    connectGbp.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('button is disabled when groomerId is null', () => {
    render(
      <GbpConnectButton
        supabase={mockSupabase}
        groomerId={null}
      />
    );

    const button = screen.getByRole('button', { name: /Connect Google Business Profile/i });
    expect(button).toBeDisabled();
  });

  it('calls connectGbp when button is clicked', async () => {
    connectGbp.mockResolvedValueOnce({ integrationId: 'int-123' });

    render(
      <GbpConnectButton
        supabase={mockSupabase}
        groomerId="groomer-123"
      />
    );

    const button = screen.getByRole('button', { name: /Connect Google Business Profile/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(connectGbp).toHaveBeenCalledWith(mockSupabase, 'groomer-123');
    });
  });

  it('renders verified badge on successful connection', async () => {
    connectGbp.mockResolvedValueOnce({ integrationId: 'int-123' });

    render(
      <GbpConnectButton
        supabase={mockSupabase}
        groomerId="groomer-123"
      />
    );

    const button = screen.getByRole('button', { name: /Connect Google Business Profile/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('✓ Google-verified')).toBeInTheDocument();
    });

    // Button should be removed
    expect(screen.queryByRole('button', { name: /Connect Google Business Profile/i })).not.toBeInTheDocument();
  });
});
