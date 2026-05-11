// ============================================================
// Route-level Error Boundary — App Router convention.
//
// Next.js wraps each route segment in an automatic ErrorBoundary
// and renders this component when a child throws. Unlike
// `global-error.tsx`, the surrounding layout (header, side panel
// shell) stays mounted, so the user sees a friendly message
// inside the familiar UI rather than a blank page.
//
// `reset()` re-mounts the segment subtree — useful for transient
// failures (network blip, stale cache). For deterministic bugs
// the user can also navigate via the header links.
// ============================================================

'use client';

import { useEffect } from 'react';
import Link from 'next/link';

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    // Wire to whatever observability stack the app picks up later.
    // For now console.error is enough — Next.js already mirrors it
    // to the server-side log in production.
    console.error('[fuelyn] Route error:', error);
  }, [error]);

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center min-h-[60vh] px-6 py-12 text-center"
    >
      <div
        aria-hidden="true"
        className="w-16 h-16 mb-5 rounded-2xl bg-rose-50 dark:bg-rose-950/40
                   flex items-center justify-center text-3xl"
      >
        {'⚠️'}
      </div>
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
        Hier ist etwas schiefgelaufen
      </h2>
      <p className="mt-2 max-w-md text-sm text-gray-600 dark:text-gray-400">
        Diese Seite konnte nicht geladen werden. Häufig ist es nur ein
        kurzer Aussetzer — versuch es noch einmal. Falls es bleibt,
        navigiere zur Startseite zurück.
      </p>

      {error.digest && (
        <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-gray-400">
          ref: {error.digest}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-xl text-sm font-semibold
                     bg-brand-600 text-white hover:bg-brand-700
                     active:scale-[0.98] transition-all duration-150
                     focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        >
          Erneut versuchen
        </button>
        <Link
          href="/"
          className="px-4 py-2 rounded-xl text-sm font-semibold
                     bg-gray-100 text-gray-800 hover:bg-gray-200
                     dark:bg-white/10 dark:text-gray-100 dark:hover:bg-white/20
                     active:scale-[0.98] transition-all duration-150"
        >
          Zur Startseite
        </Link>
      </div>
    </div>
  );
}
