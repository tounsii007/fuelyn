// ============================================================
// StatCard — small KPI tile (label on top, value below).
//
// Used in fuel-log/, stats/, and dashboard contexts. Pulls the
// standard card chrome out of the page so the tone, dark-mode
// pairs, and shadow are consistent everywhere.
// ============================================================

'use client';

import type { ReactNode } from 'react';

export interface StatCardProps {
  readonly label: string;
  readonly value: ReactNode;
  /** Optional unit suffix (rendered smaller next to the value). */
  readonly unit?: string;
  /** Optional accent color hint — uses the design tokens. */
  readonly tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger';
  readonly className?: string;
}

const TONE: Record<NonNullable<StatCardProps['tone']>, string> = {
  neutral: 'text-gray-900 dark:text-gray-50',
  brand: 'text-brand-700 dark:text-brand-300',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-red-600 dark:text-red-400',
};

export function StatCard({
  label,
  value,
  unit,
  tone = 'neutral',
  className = '',
}: StatCardProps) {
  return (
    <div
      className={`bg-white dark:bg-gray-800/80 rounded-2xl shadow-card
                  border border-gray-100 dark:border-gray-700/60
                  p-4 text-center ${className}`}
    >
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        {label}
      </p>
      <p className={`mt-1.5 text-lg font-bold ${TONE[tone]}`}>
        {value}
        {unit && (
          <span className="ml-1 text-sm font-medium text-gray-500 dark:text-gray-400">
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}
