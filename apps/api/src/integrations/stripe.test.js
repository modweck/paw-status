// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { createStripeAdapter } from './stripe.js';

describe('Stripe Adapter', () => {
  it('creates a deposit intent by calling the create_deposit_intent RPC', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: {
        external_ref: 'pi_1234567890',
        status: 'pending',
      },
      error: null,
    });

    const mockSupabase = {
      rpc: mockRpc,
    };

    const adapter = createStripeAdapter({ supabase: mockSupabase });
    const result = await adapter.createDepositIntent('appointment-123');

    expect(mockRpc).toHaveBeenCalledWith('create_deposit_intent', {
      appointment_id: 'appointment-123',
    });

    expect(result).toEqual({
      externalRef: 'pi_1234567890',
      status: 'pending',
    });
  });

  it('throws an error when the RPC call fails', async () => {
    const mockError = new Error('RPC failed');
    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: mockError,
    });

    const mockSupabase = {
      rpc: mockRpc,
    };

    const adapter = createStripeAdapter({ supabase: mockSupabase });

    await expect(adapter.createDepositIntent('appointment-123')).rejects.toThrow(mockError);
  });

  it('returns mapped externalRef and status from RPC response', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: {
        external_ref: 'pi_test_abc',
        status: 'succeeded',
      },
      error: null,
    });

    const mockSupabase = {
      rpc: mockRpc,
    };

    const adapter = createStripeAdapter({ supabase: mockSupabase });
    const result = await adapter.createDepositIntent('apt-456');

    expect(result.externalRef).toBe('pi_test_abc');
    expect(result.status).toBe('succeeded');
  });
});
