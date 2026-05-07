// ============================================================
// ToggleSwitch — accessible on/off switch with focus-visible.
//
// Replaces the inline-style toggle in alerts/page.tsx and any
// future on/off settings. Always announces its state via
// aria-checked and supports keyboard activation (space/enter)
// because role="switch" routes through the native button click
// handler.
// ============================================================

'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';

export interface ToggleSwitchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onChange'> {
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  /** Required: visible or visually-hidden label this switch controls. */
  readonly 'aria-label': string;
}

function clsx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export const ToggleSwitch = forwardRef<HTMLButtonElement, ToggleSwitchProps>(function ToggleSwitch(
  { checked, onChange, disabled, className, onClick, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        onChange(!checked);
        onClick?.(e);
      }}
      className={clsx(
        'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full',
        'transition-colors duration-200 ease-out',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'focus-visible:ring-brand-500/50',
        'focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        checked ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-600',
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={clsx(
          'inline-block h-5 w-5 rounded-full bg-white shadow-sm',
          'transform transition-transform duration-200 ease-out',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
});
