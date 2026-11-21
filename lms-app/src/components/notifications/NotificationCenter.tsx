import { Bell, CheckCheck, FileText, GraduationCap, Megaphone, BookOpen, X } from 'lucide-react';
import type { Notification } from '../../lib/types';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: Notification[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

function getIcon(type: string) {
  switch (type) {
    case 'grade_released':
      return GraduationCap;
    case 'announcement_posted':
      return Megaphone;
    case 'activity_created':
    case 'deadline_reminder':
      return FileText;
    case 'material_uploaded':
    case 'module_published':
      return BookOpen;
    default:
      return Bell;
  }
}

function formatRelative(iso: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationCenter({
  isOpen,
  onClose,
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
}: NotificationCenterProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#1E1B4B]/30 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        aria-label="Notification Center"
        className="flex h-full w-full max-w-[360px] flex-col bg-white shadow-2xl border-l border-[#E5E7EB]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[#1E1B4B]">Notifications</h2>
            <p className="text-xs text-[#6B7280]">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'} · Showing up to 100
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-[#7C5CFC] hover:bg-[#EDE9FE] cursor-pointer"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notifications"
              className="rounded-lg p-1 text-[#6B7280] hover:bg-gray-100 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#E5E7EB]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EDE9FE] text-[#7C5CFC]">
                <Bell className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-[#1E1B4B]">No notifications yet</p>
              <p className="mt-1 text-xs text-[#6B7280]">
                Updates on materials, activities, grades, and announcements will appear here.
              </p>
            </div>
          ) : (
            notifications.slice(0, 100).map((item) => {
              const Icon = getIcon(item.type);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onMarkRead(item.id)}
                  className={[
                    'flex w-full items-start gap-3 px-5 py-4 text-left transition-colors cursor-pointer',
                    !item.is_read
                      ? 'border-l-2 border-[#7C5CFC] bg-[#EDE9FE]/30 hover:bg-[#EDE9FE]/50'
                      : 'hover:bg-gray-50',
                  ].join(' ')}
                >
                  <div
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      !item.is_read ? 'bg-[#7C5CFC] text-white' : 'bg-[#F5F3FF] text-[#7C5CFC]'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={`text-sm leading-snug ${
                          !item.is_read ? 'font-semibold text-[#1E1B4B]' : 'font-medium text-[#374151]'
                        }`}
                      >
                        {item.title}
                      </p>
                      {!item.is_read && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#7C5CFC]" />
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[#6B7280] line-clamp-2">
                      {item.body}
                    </p>
                    <p className="mt-1.5 text-right text-[11px] text-[#9CA3AF]">
                      {formatRelative(item.created_at)}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}
