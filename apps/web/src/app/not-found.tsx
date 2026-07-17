// ============================================================
// 404 Not-Found page — App Router convention (Iteration 5 — UI polish).
//
// Replaces Next.js's unbranded default 404 ("This page could not be
// found") with an on-brand page that matches error.tsx's language:
// same container, brand primary button + ghost link, German copy.
// Rendered inside the root layout, so the cinematic-navy backdrop
// and header shell stay in place. Server component — no client JS.
// ============================================================

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Seite nicht gefunden',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 py-12 text-center">
      <div
        aria-hidden="true"
        className="w-16 h-16 mb-5 rounded-2xl
                   bg-gradient-to-br from-[var(--color-brand-400)] via-[var(--color-brand-600)] to-[var(--color-violet-500)]
                   text-white shadow-[var(--shadow-glow-brand)]
                   flex items-center justify-center text-3xl"
      >
        {'🧭'}
      </div>

      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-fg-subtle)]">
        Fehler 404
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
        Diese Seite gibt es nicht
      </h1>
      <p className="mt-2 max-w-md text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
        Die Adresse führt ins Leere — vielleicht wurde die Seite verschoben oder der Link ist
        veraltet. Von der Startseite aus findest du wieder die günstigste Tankstelle in deiner Nähe.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="px-4 py-2 rounded-xl text-sm font-semibold
                     bg-brand-600 text-white hover:bg-brand-700
                     active:scale-[0.98] transition-all duration-150
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
        >
          Zur Startseite
        </Link>
        <Link
          href="/locations"
          className="px-4 py-2 rounded-xl text-sm font-semibold
                     bg-gray-100 text-gray-800 hover:bg-gray-200
                     dark:bg-white/10 dark:text-gray-100 dark:hover:bg-white/20
                     active:scale-[0.98] transition-all duration-150
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
        >
          Orte durchsuchen
        </Link>
      </div>
    </div>
  );
}
