// ============================================================
// Button — accessible, themed, polymorphic.
//
// Features:
//   • 5 visual variants (primary, secondary, ghost, outline, danger)
//   • 3 sizes (sm, md, lg)
//   • optional loading state with spinner (disables click)
//   • optional leading / trailing icons
//   • full keyboard semantics + focus ring from design tokens
// ============================================================

'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-[var(--color-brand-600)] text-[var(--color-fg-inverted)] hover:bg-[var(--color-brand-700)] active:bg-[var(--color-brand-800)] shadow-[var(--shadow-sm)]',
  secondary:
    'bg-[var(--color-surface)] text-[var(--color-fg)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)]',
  outline:
    'bg-transparent text-[var(--color-brand-600)] hover:bg-[var(--color-brand-50)] dark:hover:bg-[var(--color-brand-900)]/30 border border-[var(--color-brand-500)]',
  ghost:
    'bg-transparent text-[var(--color-fg)] hover:bg-[var(--color-surface-hover)]',
  danger:
    'bg-[var(--color-danger-500)] text-white hover:opacity-90 active:opacity-95 shadow-[var(--shadow-sm)]',
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm rounded-[var(--radius-md)] gap-1.5',
  md: 'h-10 px-4 text-sm rounded-[var(--radius-lg)] gap-2',
  lg: 'h-12 px-6 text-base rounded-[var(--radius-xl)] gap-2',
};

const ICON_SIZE: Record<Size, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

function clsx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    fullWidth = false,
    leadingIcon,
    trailingIcon,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      aria-busy={loading || undefined}
      disabled={isDisabled}
      className={clsx(
        'relative inline-flex items-center justify-center font-medium select-none',
        'transition-[background-color,box-shadow,transform,opacity] duration-[var(--duration-fast)] ease-[var(--ease-snap)]',
        'disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && <Spinner className={ICON_SIZE[size]} />}
      {!loading && leadingIcon && <span className={ICON_SIZE[size]}>{leadingIcon}</span>}
      <span className={loading ? 'opacity-70' : undefined}>{children}</span>
      {!loading && trailingIcon && <span className={ICON_SIZE[size]}>{trailingIcon}</span>}
    </button>
  );
});

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={clsx('animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
