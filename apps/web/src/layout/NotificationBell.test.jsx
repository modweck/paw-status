import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationBell } from './NotificationBell.jsx';

const loadNotifications = vi.fn();
const markNotificationRead = vi.fn();
const subscribeNotifications = vi.fn();

vi.mock('../api/notifications.js', () => ({
  loadNotifications: (...args) => loadNotifications(...args),
  markNotificationRead: (...args) => markNotificationRead(...args),
  subscribeNotifications: (...args) => subscribeNotifications(...args),
}));

const supabase = { id: 'supabase-client' };

describe('NotificationBell', () => {
  beforeEach(() => {
    loadNotifications.mockReset();
    markNotificationRead.mockReset();
    subscribeNotifications.mockReset().mockReturnValue(() => {});
  });

  it('renders a bell icon', async () => {
    loadNotifications.mockResolvedValueOnce([]);

    render(<NotificationBell supabase={supabase} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Notifications')).toBeInTheDocument();
    });
  });

  it('loads notifications on mount', async () => {
    loadNotifications.mockResolvedValueOnce([]);

    render(<NotificationBell supabase={supabase} />);

    await waitFor(() => {
      expect(loadNotifications).toHaveBeenCalledWith(supabase);
    });
  });

  it('subscribes to real-time notifications on mount', async () => {
    loadNotifications.mockResolvedValueOnce([]);

    render(<NotificationBell supabase={supabase} />);

    await waitFor(() => {
      expect(subscribeNotifications).toHaveBeenCalledWith(supabase, expect.any(Function));
    });
  });

  it('renders badge with unread count from mocked loadNotifications', async () => {
    const notifications = [
      {
        id: 'notif-1',
        title: 'New request',
        body: 'You have a new booking request',
        readAt: null,
        createdAt: '2026-06-07T10:00:00.000Z',
      },
      {
        id: 'notif-2',
        title: 'Request accepted',
        body: 'Your request was accepted',
        readAt: '2026-06-06T10:00:00.000Z',
        createdAt: '2026-06-06T09:00:00.000Z',
      },
      {
        id: 'notif-3',
        title: 'Another request',
        body: 'You have another booking request',
        readAt: null,
        createdAt: '2026-06-05T10:00:00.000Z',
      },
    ];
    loadNotifications.mockResolvedValueOnce(notifications);

    render(<NotificationBell supabase={supabase} />);

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('opens dropdown when bell is clicked', async () => {
    const notifications = [
      {
        id: 'notif-1',
        title: 'New request',
        body: 'You have a new booking request',
        readAt: null,
        createdAt: '2026-06-07T10:00:00.000Z',
      },
    ];
    loadNotifications.mockResolvedValueOnce(notifications);

    render(<NotificationBell supabase={supabase} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Notifications')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Notifications'));

    await waitFor(() => {
      expect(screen.getByText('New request')).toBeInTheDocument();
    });
  });

  it('calls markNotificationRead when notification is clicked', async () => {
    const notifications = [
      {
        id: 'notif-1',
        title: 'New request',
        body: 'You have a new booking request',
        readAt: null,
        createdAt: '2026-06-07T10:00:00.000Z',
      },
    ];
    loadNotifications.mockResolvedValueOnce(notifications);
    markNotificationRead.mockResolvedValueOnce({
      ...notifications[0],
      readAt: '2026-06-07T11:00:00.000Z',
    });

    render(<NotificationBell supabase={supabase} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Notifications')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Notifications'));

    await waitFor(() => {
      expect(screen.getByText('New request')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New request'));

    await waitFor(() => {
      expect(markNotificationRead).toHaveBeenCalledWith(supabase, 'notif-1');
    });
  });

  it('decrements unread count after marking notification as read', async () => {
    const notifications = [
      {
        id: 'notif-1',
        title: 'New request',
        body: 'You have a new booking request',
        readAt: null,
        createdAt: '2026-06-07T10:00:00.000Z',
      },
      {
        id: 'notif-2',
        title: 'Another request',
        body: 'You have another booking request',
        readAt: null,
        createdAt: '2026-06-05T10:00:00.000Z',
      },
    ];
    loadNotifications.mockResolvedValueOnce(notifications);
    markNotificationRead.mockResolvedValueOnce({
      ...notifications[0],
      readAt: '2026-06-07T11:00:00.000Z',
    });

    render(<NotificationBell supabase={supabase} />);

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Notifications'));

    await waitFor(() => {
      expect(screen.getByText('New request')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New request'));

    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });
});
