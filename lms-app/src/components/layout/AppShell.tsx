import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useNotifications } from '../../hooks/useNotifications';
import { ChatWidget } from '../chat/ChatWidget';
import { NotificationCenter } from '../notifications/NotificationCenter';
import { MobileDrawer } from './MobileDrawer';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';

/**
 * Responsive LMS Application Shell (Requirements 14.1, 14.2, 14.3):
 * - >= 1024px: persistent 240px left Sidebar
 * - < 1024px: collapsible MobileDrawer
 * - Top Navbar with search, real-time NotificationBadge, and profile avatar
 */
export function AppShell() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();

  return (
    <div className="flex min-h-screen w-full bg-[#F5F3FF] text-[#1E1B4B]">
      <Sidebar />
      <MobileDrawer isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onOpenNotifications={() => setNotifOpen(true)}
        />

        <main className="flex-1 overflow-x-hidden p-4 sm:p-6">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>

      <NotificationCenter
        isOpen={notifOpen}
        onClose={() => setNotifOpen(false)}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkRead={markRead}
        onMarkAllRead={markAllRead}
      />

      <ChatWidget />
    </div>
  );
}
