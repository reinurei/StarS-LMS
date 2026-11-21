import { useCallback, useEffect, useState } from 'react';
import { lmsService } from '../lib/dataService';
import type { Notification } from '../lib/types';
import { useNotificationStore } from '../store/notificationStore';
import { useAuth } from './useAuth';
import { useRealtimeChannel } from './useRealtimeChannel';

/**
 * Manages the authenticated user's real-time in-app notifications (max 100)
 * and syncs the unread count with Zustand (Requirements 11.5, 11.6; Task 16.3).
 */
export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { unreadCount, setUnreadCount, decrementUnread } = useNotificationStore();

  const refresh = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    setIsLoading(true);
    try {
      const list = await lmsService.listNotifications(user.id);
      setNotifications(list);
      setUnreadCount(list.filter((n) => !n.is_read).length);
    } finally {
      setIsLoading(false);
    }
  }, [user, setUnreadCount]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useRealtimeChannel<Notification>(
    user ? `notifications:${user.id}` : null,
    'notification',
    (incoming) => {
      setNotifications((prev) => {
        if (prev.some((n) => n.id === incoming.id)) return prev;
        const next = [incoming, ...prev].slice(0, 100);
        setUnreadCount(next.filter((n) => !n.is_read).length);
        return next;
      });
    },
  );

  const markRead = useCallback(
    async (notificationId: string) => {
      if (!user) return;
      const target = notifications.find((n) => n.id === notificationId);
      if (!target || target.is_read) return;

      const now = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true, read_at: now } : n)),
      );
      decrementUnread();
      await lmsService.markNotificationRead(user.id, notificationId);
    },
    [user, notifications, decrementUnread],
  );

  const markAllRead = useCallback(async () => {
    if (!user) return;
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (n.is_read ? n : { ...n, is_read: true, read_at: now })),
    );
    setUnreadCount(0);
    await lmsService.markAllNotificationsRead(user.id);
  }, [user, setUnreadCount]);

  return {
    notifications,
    unreadCount,
    isLoading,
    refresh,
    markRead,
    markAllRead,
  };
}
