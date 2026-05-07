// ============================================================
// Skeleton — token-based shimmer for loading states.
// Named SkeletonV2 to coexist with the legacy <Skeleton/>.
// ============================================================

'use client';

import type { HTMLAttributes } from 'react';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  rounded?: 'sm' | 'md' | 'lg' | 'pill' | 'full';
  variant?: 'shimmer' | 'pulse';
}

const RADIUS = {
  sm: 'rounded-[var(--radius-sm)]',
  md: 'rounded-[var(--radius-md)]',
  lg: 'rounded-[var(--radius-lg)]',
  pill: 'rounded-[var(--radius-pill)]',
  full: 'rounded-full',
} as const;

export function SkeletonV2({
  width,
  height,
  rounded = 'md',
  variant = 'shimmer',
  className = '',
  style,
  ...rest
}: SkeletonProps) {
  return (
    <div
      role="status"
      aria-hidden="true"
      className={[
        'relative overflow-hidden',
        'bg-[var(--color-bg-subtle)]',
        variant === 'pulse' && 'animate-pulse',
        RADIUS[rounded],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        ...style,
      }}
      {...rest}
    >
      {variant === 'shimmer' && (
        <span
          aria-hidden
          className="absolute inset-0 -translate-x-full animate-[tp-shimmer_1.4s_infinite]"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgb(255 255 255 / 0.06) 50%, transparent 100%)',
          }}
        />
      )}
      <style>{`
        @keyframes tp-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
