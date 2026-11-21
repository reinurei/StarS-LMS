import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotificationState {
  /** Current number of unread notifications. Starts at 0; wired to Realtime in task 16.3. */
  unreadCount: number;

  /** Replace the unread count wholesale (e.g. on initial load or reconnect). */
  setUnreadCount: (n: number) => void;

  /** Decrement the unread count by 1, clamped to a minimum of 0. */
  decrementUnread: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,

  setUnreadCount: (n) =>
    set({ unreadCount: Math.max(0, n) }),

  decrementUnread: () =>
    set((state) => ({ unreadCount: Math.max(0, state.unreadCount - 1) })),
}));
