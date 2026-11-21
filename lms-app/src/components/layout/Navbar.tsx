import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, Search } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { NotificationBadge } from '../notifications/NotificationBadge';
import { ActivityStatusDot } from '../ui/ActivityStatusDot';

interface NavbarProps {
  onOpenMobileMenu: () => void;
  onOpenNotifications: () => void;
}

export function Navbar({ onOpenMobileMenu, onOpenNotifications }: NavbarProps) {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const initials = (user?.full_name ?? 'U')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/courses?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-[#E5E7EB] bg-white/95 px-4 lg:px-6 backdrop-blur-xs">
      {/* Left: Mobile hamburger + Search */}
      <div className="flex flex-1 items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-[#6B7280] hover:bg-[#EDE9FE] hover:text-[#7C5CFC] lg:hidden cursor-pointer"
        >
          <Menu className="h-5 w-5" />
        </button>

        <form onSubmit={handleSearchSubmit} className="relative hidden sm:block w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search courses, materials..."
            className="w-full rounded-full border border-transparent bg-[#F5F3FF] py-2 pl-10 pr-4 text-sm text-[#1E1B4B] placeholder-[#9CA3AF] transition focus:border-[#7C5CFC]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7C5CFC]/20"
          />
        </form>
      </div>

      {/* Right: Role Pill + Notification Bell + Profile Avatar */}
      <div className="flex items-center gap-3">
        <span className="hidden md:inline-flex items-center rounded-full bg-[#EDE9FE] px-3 py-1 text-xs font-semibold capitalize text-[#7C5CFC]">
          {role ?? 'user'} Portal
        </span>

        <NotificationBadge onClick={onOpenNotifications} />

        <Link
          to="/profile"
          className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2.5 transition hover:bg-[#F5F3FF]"
        >
          <div className="relative">
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.full_name}
                className="h-8 w-8 rounded-full object-cover ring-2 ring-[#EDE9FE]"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#6366F1] text-xs font-bold text-white shadow-xs">
                {initials}
              </div>
            )}
            <ActivityStatusDot
              status={user?.activity_status}
              className="absolute -bottom-0.5 -right-0.5"
            />
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-semibold leading-tight text-[#1E1B4B]">
              {user?.full_name ?? 'User'}
            </p>
            <p className="text-[11px] leading-tight text-[#6B7280]">{user?.email}</p>
          </div>
        </Link>
      </div>
    </header>
  );
}
