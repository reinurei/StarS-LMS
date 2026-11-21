import { NavLink, useNavigate } from 'react-router-dom';
import {
  BarChart2,
  BookOpen,
  Calendar,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  PieChart,
  Repeat,
  UserCircle,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { StarMascot } from '../mascot/StarMascot';

export interface NavItemConfig {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
  roles?: Array<'professor' | 'student'>;
}

export const NAV_ITEMS: NavItemConfig[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Courses', to: '/courses', icon: BookOpen },
  { label: 'Activities', to: '/activities', icon: FileText },
  { label: 'Attendance', to: '/attendance', icon: ClipboardCheck },
  { label: 'Grades', to: '/grades', icon: BarChart2 },
  { label: 'Forums', to: '/forums', icon: MessageSquare },
  { label: 'Calendar', to: '/calendar', icon: Calendar },
  { label: 'Analytics & Reports', to: '/reports', icon: PieChart, roles: ['professor'] },
  { label: 'Profile', to: '/profile', icon: UserCircle },
];

interface SidebarContentProps {
  onNavigate?: () => void;
}

export function SidebarContent({ onNavigate }: SidebarContentProps) {
  const { role, isDemoMode, signInDemo, signOut } = useAuth();
  const navigate = useNavigate();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || (role && item.roles.includes(role)),
  );

  const handleSwitchDemoRole = async () => {
    const nextRole = role === 'professor' ? 'student' : 'professor';
    await signInDemo(nextRole);
    onNavigate?.();
    navigate('/dashboard');
  };

  const handleSignOut = async () => {
    await signOut();
    onNavigate?.();
    navigate('/auth/login', { replace: true });
  };

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-[#2E1065] via-[#261358] to-[#1E1B4B] text-white">
      {/* Brand header */}
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-6">
        <img
          src="/logo.jpg"
          alt="StarS LMS logo"
          className="h-10 w-10 shrink-0 rounded-xl object-cover shadow-md ring-1 ring-white/25"
        />
        <div>
          <span className="text-lg font-bold tracking-tight text-white">StarS</span>
          <span className="ml-1.5 rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#DDD6FE]">
            LMS
          </span>
        </div>
      </div>

      {/* Navigation items */}
      <nav aria-label="Main navigation" className="mt-3 flex-1 space-y-1 overflow-y-auto px-3">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                [
                  'flex h-11 items-center gap-3 rounded-xl px-3 text-sm transition-all duration-150',
                  isActive
                    ? 'border-l-4 border-[#A78BFA] bg-[#7C5CFC]/35 font-semibold text-white shadow-xs'
                    : 'text-[#C4B5FD] hover:bg-white/10 hover:text-white',
                ].join(' ')
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom Mascot Companion / Demo Role Switcher */}
      <div className="border-t border-white/10 p-4 space-y-2.5">
        <div className="rounded-2xl bg-white/10 p-3.5 border border-white/15 backdrop-blur-xs text-center">
          <div className="flex justify-center -mt-1">
            <StarMascot
              pose="heart"
              size={68}
              message="Click me for a cheer!"
            />
          </div>
          <p className="mt-1 text-xs font-semibold text-white">
            {isDemoMode ? `Demo Mode (${role === 'professor' ? 'Professor' : 'Student'})` : 'StarS Buddy'}
          </p>
          <p className="mt-0.5 text-[11px] text-[#DDD6FE]/85">
            {isDemoMode
              ? 'Switch roles anytime to preview both portals.'
              : 'Open course modules to track attendance automatically.'}
          </p>
          {isDemoMode && (
            <button
              type="button"
              onClick={handleSwitchDemoRole}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#6366F1] px-3 py-2 text-xs font-semibold text-white shadow-sm ring-1 ring-white/20 transition hover:brightness-110 cursor-pointer"
            >
              <Repeat className="h-3.5 w-3.5" />
              Switch to {role === 'professor' ? 'Student' : 'Professor'}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-[#C4B5FD] transition-colors hover:bg-red-500/20 hover:text-red-200 cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden lg:flex lg:w-[240px] lg:shrink-0 lg:flex-col border-r border-white/10 bg-[#261358] shadow-md">
      <SidebarContent />
    </aside>
  );
}
