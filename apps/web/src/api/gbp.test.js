import { describe, expect, it, vi } from 'vitest';

import { connectGbp, loadIntegrations, mapIntegrationRow } from './gbp.js';

describe('gbp integration api', () => {
  describe('mapping', () => {
    it('maps groomer integration database rows to UI records', () => {
      expect(
        mapIntegrationRow({
          id: 'integration-1',
          groomer_id: 'groomer-1',
          provider: 'gbp',
          status: 'active',
          metadata: { locationId: '12345' },
          created_at: '2026-06-10T00:00:00.000Z',
        }),
      ).toEqual({
        id: 'integration-1',
        groomerId: 'groomer-1',
        provider: 'gbp',
        status: 'active',
        metadata: { locationId: '12345' },
        createdAt: '2026-06-10T00:00:00.000Z',
      });
    });

    it('returns null when mapping falsy rows', () => {
      expect(mapIntegrationRow(null)).toBeNull();
    });

    it('provides defaults for missing fields', () => {
      expect(
        mapIntegrationRow({
          id: 'integration-1',
          groomer_id: 'groomer-1',
        }),
      ).toEqual({
        id: 'integration-1',
        groomerId: 'groomer-1',
        provider: '',
        status: '',
        metadata: {},
        createdAt: '',
      });
    });
  });

  describe('connectGbp', () => {
    it('calls connect_gbp RPC and returns integration ID', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: 'integration-1',
        error: null,
      });
      const supabase = { rpc: mockRpc };

      const result = await connectGbp(supabase, 'groomer-1');

      expect(mockRpc).toHaveBeenCalledWith('connect_gbp', {
        p_groomer_id: 'groomer-1',
      });
      expect(result).toEqual({
        integrationId: 'integration-1',
      });
    });

    it('throws error when caller is not a verified groomer', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Caller is not a verified groomer for this groomer' },
      });
      const supabase = { rpc: mockRpc };

      await expect(connectGbp(supabase, 'groomer-1')).rejects.toThrow(
        'Caller is not a verified groomer for this groomer',
      );
    });

    it('throws error when RPC fails', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'RPC error' },
      });
      const supabase = { rpc: mockRpc };

      await expect(connectGbp(supabase, 'groomer-1')).rejects.toThrow('RPC error');
    });
  });

  describe('loadIntegrations', () => {
    it('loads all integrations for a groomer', async () => {
      const mockOrder = vi.fn().mockResolvedValue({
        data: [
          {
            id: 'integration-1',
            groomer_id: 'groomer-1',
            provider: 'gbp',
            status: 'active',
            metadata: { locationId: '12345' },
            created_at: '2026-06-10T00:00:00.000Z',
          },
          {
            id: 'integration-2',
            groomer_id: 'groomer-1',
            provider: 'stripe',
            status: 'pending',
            metadata: { accountId: 'acct_test' },
            created_at: '2026-06-09T00:00:00.000Z',
          },
        ],
        error: null,
      });
      const mockEq = vi.fn(() => ({ order: mockOrder }));
      const mockSelect = vi.fn(() => ({ eq: mockEq }));
      const mockFrom = vi.fn(() => ({ select: mockSelect }));
      const supabase = { from: mockFrom };

      const integrations = await loadIntegrations(supabase, 'groomer-1');

      expect(mockFrom).toHaveBeenCalledWith('groomer_integrations');
      expect(mockEq).toHaveBeenCalledWith('groomer_id', 'groomer-1');
      expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(integrations).toHaveLength(2);
      expect(integrations[0]).toMatchObject({
        id: 'integration-1',
        provider: 'gbp',
        status: 'active',
      });
      expect(integrations[1]).toMatchObject({
        id: 'integration-2',
        provider: 'stripe',
        status: 'pending',
      });
    });

    it('returns empty array when no integrations found', async () => {
      const mockOrder = vi.fn().mockResolvedValue({
        data: [],
        error: null,
      });
      const mockEq = vi.fn(() => ({ order: mockOrder }));
      const mockSelect = vi.fn(() => ({ eq: mockEq }));
      const mockFrom = vi.fn(() => ({ select: mockSelect }));
      const supabase = { from: mockFrom };

      const integrations = await loadIntegrations(supabase, 'groomer-1');

      expect(integrations).toEqual([]);
    });

    it('throws error when query fails', async () => {
      const mockOrder = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Query failed' },
      });
      const mockEq = vi.fn(() => ({ order: mockOrder }));
      const mockSelect = vi.fn(() => ({ eq: mockEq }));
      const mockFrom = vi.fn(() => ({ select: mockSelect }));
      const supabase = { from: mockFrom };

      await expect(loadIntegrations(supabase, 'groomer-1')).rejects.toThrow('Query failed');
    });
  });
});
