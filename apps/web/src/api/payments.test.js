import { describe, expect, it, vi } from 'vitest';

import { createDepositIntent, loadAppointmentPayment, mapPaymentIntentRow } from './payments.js';

describe('payments api', () => {
  describe('mapping', () => {
    it('maps payment intent database rows to UI records', () => {
      expect(
        mapPaymentIntentRow({
          id: 'payment-1',
          appointment_id: 'appointment-1',
          customer_id: 'customer-1',
          external_ref: 'pi_test123',
          amount_cents: 50000,
          status: 'succeeded',
          created_at: '2026-06-10T00:00:00.000Z',
        }),
      ).toEqual({
        id: 'payment-1',
        appointmentId: 'appointment-1',
        customerId: 'customer-1',
        externalRef: 'pi_test123',
        amountCents: 50000,
        status: 'succeeded',
        createdAt: '2026-06-10T00:00:00.000Z',
      });
    });

    it('returns null when mapping falsy rows', () => {
      expect(mapPaymentIntentRow(null)).toBeNull();
    });

    it('provides defaults for missing fields', () => {
      expect(
        mapPaymentIntentRow({
          id: 'payment-1',
          appointment_id: 'appointment-1',
          customer_id: 'customer-1',
        }),
      ).toEqual({
        id: 'payment-1',
        appointmentId: 'appointment-1',
        customerId: 'customer-1',
        externalRef: '',
        amountCents: 0,
        status: '',
        createdAt: '',
      });
    });
  });

  describe('createDepositIntent', () => {
    it('calls create_deposit_intent RPC and returns payment intent data', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          external_ref: 'pi_test123',
          status: 'succeeded',
        },
        error: null,
      });
      const supabase = { rpc: mockRpc };

      const result = await createDepositIntent(supabase, 'appointment-1');

      expect(mockRpc).toHaveBeenCalledWith('create_deposit_intent', {
        p_appointment_id: 'appointment-1',
      });
      expect(result).toEqual({
        externalRef: 'pi_test123',
        status: 'succeeded',
      });
    });

    it('throws error when RPC fails', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Appointment not found' },
      });
      const supabase = { rpc: mockRpc };

      await expect(createDepositIntent(supabase, 'unknown-appointment')).rejects.toThrow(
        'Appointment not found',
      );
    });

    it('throws error with permission denied message', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Caller does not own this appointment' },
      });
      const supabase = { rpc: mockRpc };

      await expect(createDepositIntent(supabase, 'appointment-1')).rejects.toThrow(
        'Caller does not own this appointment',
      );
    });
  });

  describe('loadAppointmentPayment', () => {
    it('loads payment intent for an appointment', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: {
          id: 'payment-1',
          appointment_id: 'appointment-1',
          customer_id: 'customer-1',
          external_ref: 'pi_test123',
          amount_cents: 50000,
          status: 'succeeded',
          created_at: '2026-06-10T00:00:00.000Z',
        },
        error: null,
      });
      const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
      const mockSelect = vi.fn(() => ({ eq: mockEq }));
      const mockFrom = vi.fn(() => ({ select: mockSelect }));
      const supabase = { from: mockFrom };

      const payment = await loadAppointmentPayment(supabase, 'appointment-1');

      expect(mockFrom).toHaveBeenCalledWith('payment_intents');
      expect(mockEq).toHaveBeenCalledWith('appointment_id', 'appointment-1');
      expect(payment).toMatchObject({
        id: 'payment-1',
        appointmentId: 'appointment-1',
        externalRef: 'pi_test123',
      });
    });

    it('returns null when payment intent is not found', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      });
      const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
      const mockSelect = vi.fn(() => ({ eq: mockEq }));
      const mockFrom = vi.fn(() => ({ select: mockSelect }));
      const supabase = { from: mockFrom };

      const payment = await loadAppointmentPayment(supabase, 'appointment-1');

      expect(payment).toBeNull();
    });

    it('throws error when query fails', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Query failed' },
      });
      const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
      const mockSelect = vi.fn(() => ({ eq: mockEq }));
      const mockFrom = vi.fn(() => ({ select: mockSelect }));
      const supabase = { from: mockFrom };

      await expect(loadAppointmentPayment(supabase, 'appointment-1')).rejects.toThrow(
        'Query failed',
      );
    });
  });
});
