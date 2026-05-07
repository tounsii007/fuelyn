// ============================================================
// Select — themed <select> with label + focus-visible ring.
//
// Mirrors the visual shape of <Input> so labelled forms stay
// visually consistent. Uses the same focus-visible ring + dark
// mode tokens; no chrome of the native dropdown is touched, so
// a11y stays intact across browsers.
// ============================================================

'use client';

import { forwardRef, useId, type SelectHTMLAttributes, type ReactNode } from 'react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly label?: string;
  readonly hint?: string;
  readonly error?: string;
  readonly children: ReactNode;
}

function clsx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, id, className, children, ...rest },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const hintId = hint ? `${selectId}-hint` : undefined;
  const errorId = error ? `${selectId}-err` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={selectId}
          className="text-xs font-medium text-gray-600 dark:text-gray-300 leading-none"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          className={clsx(
            'w-full appearance-none px-3 pr-9 py-2 text-sm rounded-xl',
            'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100',
            'border border-gray-200 dark:border-gray-700',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
            'focus-visible:border-brand-500 transition-colors',
            'disabled:opacity-60 disabled:cursor-not-allowed',
            error && 'border-red-500 focus-visible:ring-red-500/40',
            className,
          )}
          {...rest}
        >
          {children}
        </select>
        <svg
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4
                     text-gray-400 dark:text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </div>
      {hint && !error && (
        <p id={hintId} className="text-xs text-gray-500 dark:text-gray-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
