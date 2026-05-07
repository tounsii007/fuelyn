// ============================================================
// ThemeToggle — segmented control for light / dark / system.
// Uses semantic radio inputs for keyboard + screen-reader support.
// ============================================================

'use client';

import { useId } from 'react';
import { useTheme, type ThemePreference } from '@/lib/theme/ThemeProvider';

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: string }> = [
  { value: 'light', label: 'Hell', icon: '☀️' },
  { value: 'system', label: 'System', icon: '🖥️' },
  { value: 'dark', label: 'Dunkel', icon: '🌙' },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  const groupId = useId();

  return (
    <fieldset
      className={[
        'inline-flex items-center gap-0.5 p-1 rounded-[var(--radius-pill)]',
        'bg-[var(--color-bg-subtle)] border border-[var(--color-border)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Erscheinungsbild"
    >
      <legend className="sr-only">Erscheinungsbild</legend>
      {OPTIONS.map((opt) => {
        const isSelected = preference === opt.value;
        const inputId = `${groupId}-${opt.value}`;
        return (
          <label
            key={opt.value}
            htmlFor={inputId}
            className={[
              'inline-flex items-center gap-1.5 px-3 h-7 rounded-[var(--radius-pill)] cursor-pointer',
              'text-xs font-medium select-none',
              'transition-[background-color,color] duration-[var(--duration-fast)]',
              isSelected
                ? 'bg-[var(--color-surface)] text-[var(--color-fg)] shadow-[var(--shadow-xs)]'
                : 'text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]',
            ].join(' ')}
          >
            <input
              id={inputId}
              type="radio"
              name={groupId}
              value={opt.value}
              checked={isSelected}
              onChange={() => setPreference(opt.value)}
              className="sr-only"
            />
            <span aria-hidden="true">{opt.icon}</span>
            <span>{opt.label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
