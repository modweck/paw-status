import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { loadNotifications, markNotificationRead, subscribeNotifications } from '../api/notifications.js';

/**
 * NotificationBell - Display notifications with live updates
 *
 * @param {Object} props
 * @param {Object} props.supabase - Supabase client
 */
export function NotificationBell({ supabase }) {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  // Load notifications on mount
  useEffect(() => {
    let mounted = true;

    async function loadInitialNotifications() {
      try {
        const data = await loadNotifications(supabase);
        if (mounted) {
          setNotifications(data);
        }
      } catch (error) {
        console.error('Failed to load notifications:', error);
      }
    }

    loadInitialNotifications();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  // Subscribe to real-time updates
  useEffect(() => {
    const unsubscribe = subscribeNotifications(supabase, (payload) => {
      // Handle new, updated, and deleted notifications
      if (payload.eventType === 'INSERT') {
        setNotifications((current) => [
          payload.new ? { ...payload.new, readAt: payload.new.read_at } : null,
          ...current,
        ].filter(Boolean));
      } else if (payload.eventType === 'UPDATE') {
        setNotifications((current) =>
          current.map((n) =>
            n.id === payload.new?.id
              ? { ...payload.new, readAt: payload.new.read_at }
              : n,
          ),
        );
      } else if (payload.eventType === 'DELETE') {
        setNotifications((current) =>
          current.filter((n) => n.id !== payload.old?.id),
        );
      }
    });

    return unsubscribe;
  }, [supabase]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  async function handleNotificationClick(notification) {
    try {
      await markNotificationRead(supabase, notification.id);
      setNotifications((current) =>
        current.map((n) =>
          n.id === notification.id
            ? { ...n, readAt: new Date().toISOString() }
            : n,
        ),
      );
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        className="notification-bell__button"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="notification-bell__badge">{unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="notification-bell__dropdown">
          {notifications.length === 0 ? (
            <div className="notification-bell__empty">No notifications</div>
          ) : (
            <ul className="notification-bell__list">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    className={`notification-bell__item ${
                      notification.readAt ? 'is-read' : 'is-unread'
                    }`}
                    onClick={() => handleNotificationClick(notification)}
                    type="button"
                  >
                    <div className="notification-bell__item-title">
                      {notification.title}
                    </div>
                    {notification.body && (
                      <div className="notification-bell__item-body">
                        {notification.body}
                      </div>
                    )}
                    <div className="notification-bell__item-time">
                      {notification.createdAt
                        ? new Intl.DateTimeFormat(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          }).format(new Date(notification.createdAt))
                        : ''}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
