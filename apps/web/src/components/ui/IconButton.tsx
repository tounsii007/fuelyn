// ============================================================
// IconButton — square, icon-only button with hover + focus-visible.
//
// Replaces the recurring `p-1.5 rounded-lg hover:bg-gray-100 ...`
// soup found in StationCard, FavoritesPage, FuelLogPage, etc.
// Adds proper focus-visible rings (was missing) and a "danger"
// tone for destructive actions.
// ============================================================

'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Tone = 'neutral' | 'danger' | 'brand';
type Size = 'sm' | 'md';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly tone?: Tone;
  readonly size?: Size;
  /** Required for screen readers since there's no visible label. */
  readonly 'aria-label': string;
  readonly children: ReactNode;
}

const TONE: Record<Tone, string> = {
  neutral:
    'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 ' +
    'hover:text-gray-700 dark:hover:text-gray-100 ' +
    'focus-visible:ring-brand-500/40',
  danger:
    'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 ' +
    'hover:text-red-600 dark:hover:text-red-400 ' +
    'focus-visible:ring-red-500/40',
  brand:
    'text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/30 ' +
    'focus-visible:ring-brand-500/40',
};

const SIZE: Record<Size, string> = {
  sm: 'h-8 w-8 [&_svg]:w-4 [&_svg]:h-4',
  md: 'h-10 w-10 [&_svg]:w-5 [&_svg]:h-5',
};

function clsx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { tone = 'neutral', size = 'sm', type = 'button', className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx(
        'inline-flex items-center justify-center rounded-lg',
        'transition-colors duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        SIZE[size],
        TONE[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
