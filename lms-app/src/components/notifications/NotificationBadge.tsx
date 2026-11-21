import { Bell } from 'lucide-react';
import { useNotificationStore } from '../../store/notificationStore';

interface NotificationBadgeProps {
  onClick: () => void;
}

export function NotificationBadge({ onClick }: NotificationBadgeProps) {
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      className="relative flex h-10 w-10 items-center justify-center rounded-xl text-[#6B7280] transition-colors hover:bg-[#EDE9FE] hover:text-[#7C5CFC] cursor-pointer"
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <span
          data-testid="notification-unread-badge"
          className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#EF4444] px-1 text-[10px] font-bold text-white ring-2 ring-white"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}
