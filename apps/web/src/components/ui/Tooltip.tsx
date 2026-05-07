// ============================================================
// Tooltip — pure-CSS, keyboard-accessible (focus-aware) helper bubble.
// No floating-ui dependency: renders below + center via translate.
// ============================================================

'use client';

import { type ReactNode } from 'react';

export interface TooltipProps {
  label: string;
  children: ReactNode;
  side?: 'top' | 'bottom';
}

export function Tooltip({ label, children, side = 'top' }: TooltipProps) {
  const placement =
    side === 'top'
      ? 'bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2'
      : 'top-[calc(100%+6px)] left-1/2 -translate-x-1/2';

  return (
    <span className="relative inline-flex group">
      {children}
      <span
        role="tooltip"
        className={[
          'pointer-events-none absolute z-50',
          'px-2 py-1 text-xs rounded-[var(--radius-md)]',
          'bg-[var(--color-fg)] text-[var(--color-fg-inverted)] whitespace-nowrap',
          'shadow-[var(--shadow-md)]',
          'opacity-0 translate-y-1',
          'transition-[opacity,transform] duration-[var(--duration-fast)]',
          'group-hover:opacity-100 group-focus-within:opacity-100',
          'group-hover:translate-y-0 group-focus-within:translate-y-0',
          placement,
        ].join(' ')}
      >
        {label}
      </span>
    </span>
  );
}
