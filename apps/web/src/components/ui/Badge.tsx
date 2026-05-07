// ============================================================
// Badge — small status pill, tone-based.
// ============================================================

'use client';

import type { HTMLAttributes, ReactNode } from 'react';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  size?: 'sm' | 'md';
  leadingIcon?: ReactNode;
}

const TONES: Record<Tone, string> = {
  neutral:
    'bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)] border-[var(--color-border)]',
  brand:
    'bg-[var(--color-brand-50)] text-[var(--color-brand-700)] border-[var(--color-brand-200)] dark:bg-[var(--color-brand-900)]/40 dark:text-[var(--color-brand-100)] dark:border-[var(--color-brand-700)]',
  success:
    'bg-[oklch(0.95_0.05_150)] text-[var(--color-accent-700)] border-[var(--color-accent-300)] dark:bg-[oklch(0.30_0.10_150)] dark:text-[var(--color-accent-100)]',
  warning:
    'bg-[oklch(0.96_0.07_75)] text-[oklch(0.45_0.15_75)] border-[oklch(0.85_0.13_75)]',
  danger:
    'bg-[oklch(0.95_0.06_25)] text-[oklch(0.50_0.18_25)] border-[oklch(0.85_0.14_25)]',
  info:
    'bg-[oklch(0.95_0.05_230)] text-[oklch(0.46_0.15_230)] border-[oklch(0.86_0.10_230)]',
};

function clsx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function Badge({
  tone = 'neutral',
  size = 'sm',
  leadingIcon,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 font-medium border rounded-[var(--radius-pill)]',
        size === 'sm' ? 'h-5 px-2 text-[11px]' : 'h-6 px-2.5 text-xs',
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {leadingIcon && <span className="h-3 w-3">{leadingIcon}</span>}
      {children}
    </span>
  );
}
