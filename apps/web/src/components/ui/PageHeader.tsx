// ============================================================
// PageHeader — back link + title + optional action button.
//
// Eliminates the back-link / title boilerplate that recurred in
// alerts/, favorites/, fuel-log/, compare/, station/, and other
// secondary pages. One source of truth for spacing, typography,
// and dark-mode tokens.
// ============================================================

'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

export interface PageHeaderProps {
  /** Back-link target. Defaults to "/" (home). */
  readonly backHref?: string;
  /** Localised back-link label. */
  readonly backLabel?: string;
  readonly title: string;
  /** Optional subtitle line under the title. */
  readonly subtitle?: string;
  /** Right-aligned action(s) (typically a primary Button). */
  readonly action?: ReactNode;
  readonly className?: string;
}

export function PageHeader({
  backHref = '/',
  backLabel = 'Zurück',
  title,
  subtitle,
  action,
  className = '',
}: PageHeaderProps) {
  return (
    <header className={`mb-6 ${className}`}>
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm font-medium
                   text-gray-500 dark:text-gray-400
                   hover:text-gray-800 dark:hover:text-gray-200
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40
                   focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                   rounded-md transition-colors mb-4"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        {backLabel}
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50 truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
          )}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
    </header>
  );
}
