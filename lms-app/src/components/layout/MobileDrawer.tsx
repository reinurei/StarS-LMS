import { X } from 'lucide-react';
import { SidebarContent } from './Sidebar';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Collapsible mobile drawer navigation shown on viewports < 1024px (Req 14.3).
 */
export function MobileDrawer({ isOpen, onClose }: MobileDrawerProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex lg:hidden bg-[#1E1B4B]/40 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex h-full w-[260px] flex-col bg-[#261358] shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation menu"
          className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-[#C4B5FD] hover:bg-white/10 hover:text-white cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarContent onNavigate={onClose} />
      </div>
    </div>
  );
}
