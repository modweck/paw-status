import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  loadNotifications,
  markNotificationRead,
  mapNotificationRow,
  subscribeNotifications,
} from './notifications.js';

describe('notifications api', () => {
  describe('mapping', () => {
    it('maps notification database rows to UI records', () => {
      expect(
        mapNotificationRow({
          id: 'notif-1',
          kind: 'new_request',
          title: 'New appointment request',
          body: 'Mochi needs a full groom',
          data: { appointmentRequestId: 'request-1' },
          read_at: null,
          created_at: '2026-06-10T00:00:00.000Z',
        }),
      ).toEqual({
        id: 'notif-1',
        kind: 'new_request',
        title: 'New appointment request',
        body: 'Mochi needs a full groom',
        data: { appointmentRequestId: 'request-1' },
        readAt: null,
        createdAt: '2026-06-10T00:00:00.000Z',
      });
    });

    it('returns null when mapping falsy rows', () => {
      expect(mapNotificationRow(null)).toBeNull();
    });

    it('handles missing optional fields', () => {
      expect(mapNotificationRow({ id: 'notif-1', created_at: '2026-06-10T00:00:00.000Z' })).toEqual(
        {
          id: 'notif-1',
          kind: '',
          title: '',
          body: '',
          data: null,
          readAt: null,
          createdAt: '2026-06-10T00:00:00.000Z',
        },
      );
    });
  });

  describe('loadNotifications', () => {
    it('loads notifications for the current user', async () => {
      const mockOrder = vi.fn().mockResolvedValue({
        data: [
          {
            id: 'notif-1',
            kind: 'new_request',
            title: 'New appointment request',
            body: 'Mochi needs a full groom',
            data: { appointmentRequestId: 'request-1' },
            read_at: null,
            created_at: '2026-06-10T00:00:00.000Z',
          },
          {
            id: 'notif-2',
            kind: 'request_confirmed',
            title: 'Request confirmed',
            body: 'Your appointment was confirmed',
            data: { appointmentId: 'appt-1' },
            read_at: '2026-06-10T12:00:00.000Z',
            created_at: '2026-06-09T00:00:00.000Z',
          },
        ],
        error: null,
      });
      const mockSelect = vi.fn(() => ({ order: mockOrder }));
      const mockFrom = vi.fn(() => ({ select: mockSelect }));
      const supabase = { from: mockFrom };

      const notifications = await loadNotifications(supabase);

      expect(mockFrom).toHaveBeenCalledWith('notifications');
      expect(mockSelect).toHaveBeenCalled();
      expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(notifications).toHaveLength(2);
      expect(notifications[0]).toMatchObject({
        id: 'notif-1',
        kind: 'new_request',
      });
      expect(notifications[1]).toMatchObject({
        id: 'notif-2',
        readAt: '2026-06-10T12:00:00.000Z',
      });
    });

    it('returns empty array when no notifications found', async () => {
      const mockOrder = vi.fn().mockResolvedValue({
        data: [],
        error: null,
      });
      const mockSelect = vi.fn(() => ({ order: mockOrder }));
      const mockFrom = vi.fn(() => ({ select: mockSelect }));
      const supabase = { from: mockFrom };

      const notifications = await loadNotifications(supabase);

      expect(notifications).toEqual([]);
    });

    it('throws error when query fails', async () => {
      const mockOrder = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Query error' },
      });
      const mockSelect = vi.fn(() => ({ order: mockOrder }));
      const mockFrom = vi.fn(() => ({ select: mockSelect }));
      const supabase = { from: mockFrom };

      await expect(loadNotifications(supabase)).rejects.toThrow('Query error');
    });
  });

  describe('markNotificationRead', () => {
    it('updates notification read_at timestamp and returns updated record', async () => {
      const now = new Date().toISOString();
      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          id: 'notif-1',
          kind: 'new_request',
          title: 'New appointment request',
          body: 'Mochi needs a full groom',
          data: { appointmentRequestId: 'request-1' },
          read_at: now,
          created_at: '2026-06-10T00:00:00.000Z',
        },
        error: null,
      });
      const mockSelect = vi.fn(() => ({ single: mockSingle }));
      const mockEq = vi.fn(() => ({ select: mockSelect }));
      const mockUpdate = vi.fn(() => ({ eq: mockEq }));
      const mockFrom = vi.fn(() => ({ update: mockUpdate }));
      const supabase = { from: mockFrom };

      const updatedNotification = await markNotificationRead(supabase, 'notif-1');

      expect(mockFrom).toHaveBeenCalledWith('notifications');
      expect(mockUpdate).toHaveBeenCalledWith({
        read_at: expect.any(String),
      });
      expect(mockEq).toHaveBeenCalledWith('id', 'notif-1');
      expect(updatedNotification).toMatchObject({
        id: 'notif-1',
        kind: 'new_request',
        readAt: expect.any(String),
      });
    });

    it('throws error when update fails', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Update error' },
      });
      const mockSelect = vi.fn(() => ({ single: mockSingle }));
      const mockEq = vi.fn(() => ({ select: mockSelect }));
      const mockUpdate = vi.fn(() => ({ eq: mockEq }));
      const mockFrom = vi.fn(() => ({ update: mockUpdate }));
      const supabase = { from: mockFrom };

      await expect(markNotificationRead(supabase, 'notif-1')).rejects.toThrow('Update error');
    });
  });

  describe('subscribeNotifications', () => {
    it('sets up a realtime channel and returns an unsubscribe function', () => {
      const mockSubscribe = vi.fn().mockReturnValue({});
      const mockOn = vi.fn().mockReturnValue({
        subscribe: mockSubscribe,
      });
      const mockChannel = vi.fn().mockReturnValue({
        on: mockOn,
      });
      const mockRemoveChannel = vi.fn();
      const supabase = {
        channel: mockChannel,
        removeChannel: mockRemoveChannel,
      };
      const onNotification = vi.fn();

      const unsubscribe = subscribeNotifications(supabase, onNotification);

      expect(mockChannel).toHaveBeenCalledWith('notifications');
      expect(mockOn).toHaveBeenCalledWith(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
        },
        expect.any(Function),
      );
      expect(mockSubscribe).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('calls the callback when a notification payload is received', () => {
      const mockChannel = {};
      const mockSubscribe = vi.fn().mockReturnValue(mockChannel);
      let capturedCallback;
      const mockOn = vi.fn((event, config, callback) => {
        capturedCallback = callback;
        return { subscribe: mockSubscribe };
      });
      const mockChannelFn = vi.fn().mockReturnValue({
        on: mockOn,
      });
      const mockRemoveChannel = vi.fn();
      const supabase = {
        channel: mockChannelFn,
        removeChannel: mockRemoveChannel,
      };
      const onNotification = vi.fn();

      subscribeNotifications(supabase, onNotification);

      // Simulate receiving a payload
      const payload = {
        new: {
          id: 'notif-1',
          kind: 'new_request',
          title: 'New request',
        },
      };
      capturedCallback(payload);

      expect(onNotification).toHaveBeenCalledWith(payload);
    });

    it('returns an unsubscribe function that removes the channel', () => {
      const mockChannel = {};
      const mockSubscribe = vi.fn().mockReturnValue(mockChannel);
      const mockOn = vi.fn().mockReturnValue({
        subscribe: mockSubscribe,
      });
      const mockChannelFn = vi.fn().mockReturnValue({
        on: mockOn,
      });
      const mockRemoveChannel = vi.fn();
      const supabase = {
        channel: mockChannelFn,
        removeChannel: mockRemoveChannel,
      };
      const onNotification = vi.fn();

      const unsubscribe = subscribeNotifications(supabase, onNotification);
      unsubscribe();

      expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
    });
  });
});
