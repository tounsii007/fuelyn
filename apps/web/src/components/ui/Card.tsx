// ============================================================
// Card — themed surface container with optional padding/elevation.
// ============================================================

'use client';

import { forwardRef, type HTMLAttributes } from 'react';

type Padding = 'none' | 'sm' | 'md' | 'lg';
type Elevation = 'flat' | 'raised' | 'overlay';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: Padding;
  elevation?: Elevation;
  interactive?: boolean;
}

const PADDING: Record<Padding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

const ELEVATION: Record<Elevation, string> = {
  flat: 'shadow-none border border-[var(--color-border)]',
  raised: 'shadow-[var(--shadow-md)] border border-[var(--color-border-subtle)]',
  overlay: 'shadow-[var(--shadow-xl)] border border-[var(--color-border)]',
};

function clsx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { padding = 'md', elevation = 'raised', interactive, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={clsx(
        'bg-[var(--color-surface)] text-[var(--color-fg)] rounded-[var(--radius-xl)]',
        ELEVATION[elevation],
        PADDING[padding],
        interactive &&
          'cursor-pointer transition-[box-shadow,transform] duration-[var(--duration-fast)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)] active:translate-y-0',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});
