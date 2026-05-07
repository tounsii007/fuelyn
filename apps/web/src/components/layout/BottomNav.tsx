// ============================================================
// BottomNav — modern, glass-morphic, floating tab bar for mobile.
//
// Visible on viewports < md. Sits above the safe-area inset. Active
// tab gets a soft pill background; subtle press-feedback on tap.
// ============================================================

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

interface Tab {
  href: string;
  label: string;
  icon: ReactNode;
}

const TABS: Tab[] = [
  { href: '/', label: 'Karte', icon: <MapIcon /> },
  { href: '/compare', label: 'Vergleich', icon: <CompareIcon /> },
  { href: '/fuel-log', label: 'Logbuch', icon: <BookIcon /> },
  { href: '/favorites', label: 'Favoriten', icon: <HeartIcon /> },
  { href: '/settings', label: 'Mehr', icon: <DotsIcon /> },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Hauptnavigation"
      className="md:hidden fixed bottom-3 left-1/2 -translate-x-1/2 z-30 safe-bottom
                 fy-glass rounded-[var(--radius-pill)] shadow-[var(--shadow-lg)]
                 px-1.5 py-1 flex items-center gap-1"
    >
      {TABS.map((tab) => {
        const active =
          pathname === tab.href ||
          (tab.href !== '/' && pathname?.startsWith(tab.href));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={[
              'relative flex flex-col items-center justify-center gap-0.5 min-w-[60px] h-12 px-3',
              'rounded-[var(--radius-pill)] fy-press transition-colors',
              active
                ? 'text-[var(--color-brand-700)] dark:text-[var(--color-brand-100)]'
                : 'text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]',
            ].join(' ')}
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-[var(--radius-pill)]
                           bg-[var(--color-brand-100)]/70 dark:bg-[var(--color-brand-800)]/40"
              />
            )}
            <span className="relative z-10">{tab.icon}</span>
            <span className="relative z-10 text-[10px] font-medium leading-none">
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

// ─── Icons ─────────────────────────────────────────────────

const stroke = { strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function MapIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path {...stroke} d="M9 6 3 4v14l6 2 6-2 6 2V6l-6-2-6 2ZM9 6v14M15 4v14" />
    </svg>
  );
}
function CompareIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path {...stroke} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}
function BookIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path {...stroke} d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </svg>
  );
}
function HeartIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path {...stroke} d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
    </svg>
  );
}
function DotsIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}
