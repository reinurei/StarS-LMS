import React from 'react';

export type BadgeVariant =
  | 'submitted'
  | 'late'
  | 'missing'
  | 'graded'
  | 'upcoming'
  | 'present'
  | 'absent'
  | 'excused'
  | 'timed_out'
  | 'pending'
  | 'primary'
  | 'neutral';

const BADGE_CLASSES: Record<BadgeVariant, string> = {
  submitted: 'bg-blue-100 text-blue-700',
  late: 'bg-amber-100 text-amber-700',
  missing: 'bg-red-100 text-red-700',
  graded: 'bg-emerald-100 text-emerald-700',
  upcoming: 'bg-gray-100 text-gray-600',
  present: 'bg-emerald-100 text-emerald-700',
  absent: 'bg-red-100 text-red-700',
  excused: 'bg-blue-100 text-blue-700',
  timed_out: 'bg-orange-100 text-orange-700',
  pending: 'bg-purple-100 text-purple-700',
  primary: 'bg-[#EDE9FE] text-[#7C5CFC]',
  neutral: 'bg-gray-100 text-gray-700',
};

export interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
        BADGE_CLASSES[variant],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  );
}
