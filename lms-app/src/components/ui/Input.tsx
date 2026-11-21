import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, helperText, id, className = '', ...rest },
  ref,
) {
  const inputId = id ?? (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-[#1E1B4B]">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={[
          'block w-full rounded-lg border bg-white px-3.5 py-2 text-sm text-[#1E1B4B] placeholder-[#9CA3AF]',
          'transition-colors duration-150 focus:outline-none focus:ring-2',
          'disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed',
          error
            ? 'border-red-400 ring-2 ring-red-100 focus:border-red-500 focus:ring-red-200'
            : 'border-[#E5E7EB] focus:border-[#7C5CFC] focus:ring-[#7C5CFC]/25',
          className,
        ].join(' ')}
        {...rest}
      />
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : helperText ? (
        <p className="mt-1 text-xs text-[#6B7280]">{helperText}</p>
      ) : null}
    </div>
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, helperText, id, className = '', ...rest },
  ref,
) {
  const inputId = id ?? (label ? `textarea-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-[#1E1B4B]">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={inputId}
        aria-invalid={Boolean(error)}
        className={[
          'block w-full rounded-lg border bg-white px-3.5 py-2 text-sm text-[#1E1B4B] placeholder-[#9CA3AF]',
          'transition-colors duration-150 focus:outline-none focus:ring-2',
          'disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed',
          error
            ? 'border-red-400 ring-2 ring-red-100 focus:border-red-500 focus:ring-red-200'
            : 'border-[#E5E7EB] focus:border-[#7C5CFC] focus:ring-[#7C5CFC]/25',
          className,
        ].join(' ')}
        {...rest}
      />
      {error ? (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : helperText ? (
        <p className="mt-1 text-xs text-[#6B7280]">{helperText}</p>
      ) : null}
    </div>
  );
});
