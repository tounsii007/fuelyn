// ============================================================
// Input — themed text input with label, hint, error, and adornments.
// ============================================================

'use client';

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

function clsx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leadingIcon, trailingIcon, id, className, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-err` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-[var(--color-fg)] leading-none"
        >
          {label}
        </label>
      )}
      <div
        className={clsx(
          'group relative flex h-11 items-center rounded-[var(--radius-lg)]',
          'bg-[var(--color-surface)] border border-[var(--color-border)]',
          'transition-[border-color,box-shadow] duration-[var(--duration-fast)]',
          'focus-within:border-[var(--color-brand-500)] focus-within:shadow-[var(--shadow-glow-brand)]',
          error && 'border-[var(--color-danger-500)] focus-within:border-[var(--color-danger-500)]',
        )}
      >
        {leadingIcon && (
          <span className="pl-3 text-[var(--color-fg-subtle)]">{leadingIcon}</span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          className={clsx(
            'w-full bg-transparent px-3 text-sm text-[var(--color-fg)]',
            'placeholder:text-[var(--color-fg-subtle)] outline-none',
            className,
          )}
          {...rest}
        />
        {trailingIcon && (
          <span className="pr-3 text-[var(--color-fg-subtle)]">{trailingIcon}</span>
        )}
      </div>
      {hint && !error && (
        <p id={hintId} className="text-xs text-[var(--color-fg-subtle)]">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-[var(--color-danger-500)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
