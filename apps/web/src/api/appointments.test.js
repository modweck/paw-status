import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  cancelAppointment,
  confirmRequest,
  createSlotBookingRequest,
  declineRequest,
  loadCustomerAppointments,
  loadGroomerRequests,
  mapAppointmentRequestRow,
  mapAppointmentRow,
} from './appointments.js';

describe('appointments api', () => {
  describe('mapping', () => {
    it('maps appointment database rows to UI records', () => {
      expect(
        mapAppointmentRow({
          id: 'appointment-1',
          dog_id: 'dog-1',
          groomer_id: 'groomer-1',
          service_id: 'full-groom',
          scheduled_at: '2026-06-15T10:00:00.000Z',
          duration_minutes: 60,
          status: 'confirmed',
          created_at: '2026-06-10T00:00:00.000Z',
        }),
      ).toEqual({
        id: 'appointment-1',
        dogId: 'dog-1',
        groomerId: 'groomer-1',
        serviceId: 'full-groom',
        scheduledAt: '2026-06-15T10:00:00.000Z',
        durationMinutes: 60,
        status: 'confirmed',
        createdAt: '2026-06-10T00:00:00.000Z',
      });
    });

    it('maps appointment request database rows to UI records', () => {
      expect(
        mapAppointmentRequestRow({
          id: 'request-1',
          customer_id: 'customer-1',
          dog_id: 'dog-1',
          groomer_id: 'groomer-1',
          service: 'full-groom',
          status: 'requested',
          created_at: '2026-06-10T00:00:00.000Z',
          updated_at: '2026-06-10T00:00:00.000Z',
        }),
      ).toEqual({
        id: 'request-1',
        customerId: 'customer-1',
        dogId: 'dog-1',
        groomerId: 'groomer-1',
        service: 'full-groom',
        status: 'requested',
        createdAt: '2026-06-10T00:00:00.000Z',
        updatedAt: '2026-06-10T00:00:00.000Z',
      });
    });

    it('returns null when mapping falsy rows', () => {
      expect(mapAppointmentRow(null)).toBeNull();
      expect(mapAppointmentRequestRow(null)).toBeNull();
    });
  });

  describe('createSlotBookingRequest', () => {
    it('creates an appointment request with required fields', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          id: 'request-1',
          customer_id: 'customer-1',
          dog_id: 'dog-1',
          groomer_id: 'groomer-1',
          service: 'full-groom',
          status: 'requested',
          created_at: '2026-06-10T00:00:00.000Z',
          updated_at: '2026-06-10T00:00:00.000Z',
        },
        error: null,
      });
      const mockSelect = vi.fn(() => ({ single: mockSingle }));
      const mockInsert = vi.fn(() => ({ select: mockSelect }));
      const mockFrom = vi.fn(() => ({ insert: mockInsert }));
      const supabase = { from: mockFrom };

      const request = await createSlotBookingRequest(supabase, {
        customerId: 'customer-1',
        dogId: 'dog-1',
        groomerId: 'groomer-1',
        service: 'full-groom',
        preferredWindows: [{ type: 'first-available' }],
      });

      expect(mockFrom).toHaveBeenCalledWith('appointment_requests');
      expect(mockInsert).toHaveBeenCalledWith({
        customer_id: 'customer-1',
        dog_id: 'dog-1',
        groomer_id: 'groomer-1',
        service: 'full-groom',
        preferred_windows: [{ type: 'first-available' }],
        customer_notes: null,
        status: 'requested',
      });
      expect(request).toMatchObject({
        id: 'request-1',
        customerId: 'customer-1',
      });
    });

    it('throws error when insert fails', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });
      const mockSelect = vi.fn(() => ({ single: mockSingle }));
      const mockInsert = vi.fn(() => ({ select: mockSelect }));
      const mockFrom = vi.fn(() => ({ insert: mockInsert }));
      const supabase = { from: mockFrom };

      await expect(
        createSlotBookingRequest(supabase, {
          customerId: 'customer-1',
          dogId: 'dog-1',
          groomerId: 'groomer-1',
          service: 'full-groom',
        }),
      ).rejects.toThrow('Database error');
    });
  });

  describe('confirmRequest', () => {
    it('calls confirm_appointment_request RPC and returns appointment ID', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: 'appointment-1',
        error: null,
      });
      const supabase = { rpc: mockRpc };

      const appointmentId = await confirmRequest(supabase, 'request-1', '2026-06-15T10:00:00.000Z');

      expect(mockRpc).toHaveBeenCalledWith('confirm_appointment_request', {
        p_request_id: 'request-1',
        p_slot_at: '2026-06-15T10:00:00.000Z',
      });
      expect(appointmentId).toBe('appointment-1');
    });

    it('throws error with double-booking message when time is just booked', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'That time was just booked' },
      });
      const supabase = { rpc: mockRpc };

      await expect(
        confirmRequest(supabase, 'request-1', '2026-06-15T10:00:00.000Z'),
      ).rejects.toThrow('That time was just booked');
    });

    it('throws error when RPC fails', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'RPC error' },
      });
      const supabase = { rpc: mockRpc };

      await expect(
        confirmRequest(supabase, 'request-1', '2026-06-15T10:00:00.000Z'),
      ).rejects.toThrow('RPC error');
    });
  });

  describe('declineRequest', () => {
    it('calls decline_appointment_request RPC', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      });
      const supabase = { rpc: mockRpc };

      await declineRequest(supabase, 'request-1', 'Too short notice');

      expect(mockRpc).toHaveBeenCalledWith('decline_appointment_request', {
        p_request_id: 'request-1',
        p_note: 'Too short notice',
      });
    });

    it('passes null note when not provided', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      });
      const supabase = { rpc: mockRpc };

      await declineRequest(supabase, 'request-1');

      expect(mockRpc).toHaveBeenCalledWith('decline_appointment_request', {
        p_request_id: 'request-1',
        p_note: null,
      });
    });

    it('throws error when RPC fails', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'RPC error' },
      });
      const supabase = { rpc: mockRpc };

      await expect(declineRequest(supabase, 'request-1')).rejects.toThrow('RPC error');
    });
  });

  describe('cancelAppointment', () => {
    it('calls cancel_appointment RPC', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      });
      const supabase = { rpc: mockRpc };

      await cancelAppointment(supabase, 'appointment-1', 'Emergency');

      expect(mockRpc).toHaveBeenCalledWith('cancel_appointment', {
        p_appointment_id: 'appointment-1',
        p_reason: 'Emergency',
      });
    });

    it('passes null reason when not provided', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      });
      const supabase = { rpc: mockRpc };

      await cancelAppointment(supabase, 'appointment-1');

      expect(mockRpc).toHaveBeenCalledWith('cancel_appointment', {
        p_appointment_id: 'appointment-1',
        p_reason: null,
      });
    });

    it('throws error when RPC fails', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Not authorized' },
      });
      const supabase = { rpc: mockRpc };

      await expect(cancelAppointment(supabase, 'appointment-1')).rejects.toThrow('Not authorized');
    });
  });

  describe('loadGroomerRequests', () => {
    it('loads appointment requests for a groomer', async () => {
      const mockOrder = vi.fn().mockResolvedValue({
        data: [
          {
            id: 'request-1',
            customer_id: 'customer-1',
            dog_id: 'dog-1',
            groomer_id: 'groomer-1',
            service: 'full-groom',
            status: 'requested',
            created_at: '2026-06-10T00:00:00.000Z',
            updated_at: '2026-06-10T00:00:00.000Z',
          },
        ],
        error: null,
      });
      const mockEq = vi.fn(() => ({ order: mockOrder }));
      const mockSelect = vi.fn(() => ({ eq: mockEq }));
      const mockFrom = vi.fn(() => ({ select: mockSelect }));
      const supabase = { from: mockFrom };

      const requests = await loadGroomerRequests(supabase, 'groomer-1');

      expect(mockFrom).toHaveBeenCalledWith('appointment_requests');
      expect(mockEq).toHaveBeenCalledWith('groomer_id', 'groomer-1');
      expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        id: 'request-1',
        groomerId: 'groomer-1',
      });
    });

    it('returns empty array when no requests found', async () => {
      const mockOrder = vi.fn().mockResolvedValue({
        data: [],
        error: null,
      });
      const mockEq = vi.fn(() => ({ order: mockOrder }));
      const mockSelect = vi.fn(() => ({ eq: mockEq }));
      const mockFrom = vi.fn(() => ({ select: mockSelect }));
      const supabase = { from: mockFrom };

      const requests = await loadGroomerRequests(supabase, 'groomer-1');

      expect(requests).toEqual([]);
    });

    it('throws error when query fails', async () => {
      const mockOrder = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Query error' },
      });
      const mockEq = vi.fn(() => ({ order: mockOrder }));
      const mockSelect = vi.fn(() => ({ eq: mockEq }));
      const mockFrom = vi.fn(() => ({ select: mockSelect }));
      const supabase = { from: mockFrom };

      await expect(loadGroomerRequests(supabase, 'groomer-1')).rejects.toThrow('Query error');
    });
  });

  describe('loadCustomerAppointments', () => {
    it('loads appointments for a customer by loading their dogs first', async () => {
      const mockOrderAppts = vi.fn().mockResolvedValue({
        data: [
          {
            id: 'appointment-1',
            dog_id: 'dog-1',
            groomer_id: 'groomer-1',
            service_id: 'full-groom',
            scheduled_at: '2026-06-15T10:00:00.000Z',
            duration_minutes: 60,
            status: 'confirmed',
            created_at: '2026-06-10T00:00:00.000Z',
          },
        ],
        error: null,
      });
      const mockInAppts = vi.fn(() => ({ order: mockOrderAppts }));
      const mockSelectAppts = vi.fn(() => ({ in: mockInAppts }));

      const mockEqDogs = vi.fn().mockResolvedValue({
        data: [{ id: 'dog-1' }, { id: 'dog-2' }],
        error: null,
      });
      const mockSelectDogs = vi.fn(() => ({ eq: mockEqDogs }));

      const fromFn = vi.fn((table) => {
        if (table === 'dogs') {
          return { select: mockSelectDogs };
        }
        return { select: mockSelectAppts };
      });
      const supabase = { from: fromFn };

      const appointments = await loadCustomerAppointments(supabase, 'customer-1');

      expect(fromFn).toHaveBeenNthCalledWith(1, 'dogs');
      expect(mockSelectDogs).toHaveBeenCalled();
      expect(mockEqDogs).toHaveBeenCalledWith('customer_id', 'customer-1');
      expect(appointments).toHaveLength(1);
      expect(appointments[0]).toMatchObject({
        id: 'appointment-1',
        dogId: 'dog-1',
      });
    });

    it('returns empty array when customer has no dogs', async () => {
      const mockEqDogs = vi.fn().mockResolvedValue({
        data: [],
        error: null,
      });
      const mockSelectDogs = vi.fn(() => ({ eq: mockEqDogs }));
      const mockFrom = vi.fn(() => ({ select: mockSelectDogs }));
      const supabase = { from: mockFrom };

      const appointments = await loadCustomerAppointments(supabase, 'customer-1');

      expect(appointments).toEqual([]);
    });

    it('throws error when loading dogs fails', async () => {
      const mockEqDogs = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Dogs query error' },
      });
      const mockSelectDogs = vi.fn(() => ({ eq: mockEqDogs }));
      const mockFrom = vi.fn(() => ({ select: mockSelectDogs }));
      const supabase = { from: mockFrom };

      await expect(loadCustomerAppointments(supabase, 'customer-1')).rejects.toThrow(
        'Dogs query error',
      );
    });

    it('throws error when loading appointments fails', async () => {
      const mockOrderAppts = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Appointments query error' },
      });
      const mockInAppts = vi.fn(() => ({ order: mockOrderAppts }));
      const mockSelectAppts = vi.fn(() => ({ in: mockInAppts }));

      const mockEqDogs = vi.fn().mockResolvedValue({
        data: [{ id: 'dog-1' }],
        error: null,
      });
      const mockSelectDogs = vi.fn(() => ({ eq: mockEqDogs }));

      const fromFn = vi.fn((table) => {
        if (table === 'dogs') {
          return { select: mockSelectDogs };
        }
        return { select: mockSelectAppts };
      });
      const supabase = { from: fromFn };

      await expect(loadCustomerAppointments(supabase, 'customer-1')).rejects.toThrow(
        'Appointments query error',
      );
    });
  });
});
