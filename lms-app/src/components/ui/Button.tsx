import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-[#7C5CFC] text-white hover:bg-[#6A48F5] active:bg-[#5B39E0] focus:ring-[#7C5CFC]/30 shadow-sm',
  secondary:
    'bg-[#EDE9FE] text-[#7C5CFC] hover:bg-[#DDD6FE] active:bg-[#C4B5FD] focus:ring-[#7C5CFC]/30',
  danger:
    'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 active:bg-red-200 focus:ring-red-300',
  ghost: 'bg-transparent text-[#6B7280] hover:bg-gray-100 hover:text-[#1E1B4B] focus:ring-gray-200',
  outline:
    'bg-white text-[#1E1B4B] border border-[#E5E7EB] hover:bg-[#F5F3FF] hover:border-[#7C5CFC]/40 focus:ring-[#7C5CFC]/20',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-4 py-2 text-sm rounded-lg gap-2',
  lg: 'px-5 py-2.5 text-sm rounded-xl gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={[
        'inline-flex items-center justify-center font-medium transition-all duration-150',
        'focus:outline-none focus:ring-2 cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      ].join(' ')}
      {...rest}
    >
      {isLoading && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}
