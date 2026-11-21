import type { UserActivityStatus } from '../../lib/types';

export const ACTIVITY_STATUS_META: Record<
  UserActivityStatus,
  { label: string; dotClass: string; badgeClass: string }
> = {
  active: {
    label: 'Active',
    dotClass: 'bg-emerald-500',
    badgeClass: 'bg-emerald-100 text-emerald-700',
  },
  idle: {
    label: 'Idle',
    dotClass: 'bg-amber-400',
    badgeClass: 'bg-amber-100 text-amber-800',
  },
  dnd: {
    label: 'Do not disturb',
    dotClass: 'bg-red-500',
    badgeClass: 'bg-red-100 text-red-700',
  },
  offline: {
    label: 'Offline',
    dotClass: 'bg-gray-400',
    badgeClass: 'bg-gray-100 text-gray-600',
  },
};

export function ActivityStatusDot({
  status = 'active',
  size = 'sm',
  className = '',
}: {
  status?: UserActivityStatus;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const meta = ACTIVITY_STATUS_META[status] ?? ACTIVITY_STATUS_META.active;
  const dims = size === 'md' ? 'h-3 w-3' : 'h-2.5 w-2.5';
  return (
    <span
      title={meta.label}
      className={`inline-block shrink-0 rounded-full ring-2 ring-white ${dims} ${meta.dotClass} ${className}`}
    />
  );
}

export function ActivityStatusBadge({ status = 'active' }: { status?: UserActivityStatus }) {
  const meta = ACTIVITY_STATUS_META[status] ?? ACTIVITY_STATUS_META.active;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.badgeClass}`}
    >
      <span className={`h-2 w-2 rounded-full ${meta.dotClass}`} />
      {meta.label}
    </span>
  );
}
