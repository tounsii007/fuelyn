// ============================================================
// Global Error Boundary — last-resort catch when the root layout
// itself throws (provider crash, ThemeProvider, font loader, …).
//
// Next.js does NOT mount the regular layout here, so this component
// owns its own <html>+<body>. We deliberately keep markup minimal
// and avoid client-side dependencies: if the providers crashed,
// pulling in TanStack Query or the Zustand store would just crash
// again. Pure HTML + a single inline-style block keeps it bullet-
// proof.
// ============================================================

'use client';

import { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error('[fuelyn] Global error (layout crashed):', error);
  }, [error]);

  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          background: '#f8fafc',
          color: '#0f172a',
        }}
      >
        <div
          role="alert"
          style={{
            maxWidth: 480,
            padding: '32px 28px',
            background: 'white',
            borderRadius: 20,
            boxShadow: '0 10px 30px rgba(15,23,42,0.08)',
            textAlign: 'center',
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 56,
              height: 56,
              margin: '0 auto 16px',
              background: '#fef2f2',
              borderRadius: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
            }}
          >
            {'⚠️'}
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>
            Anwendung konnte nicht geladen werden
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: '#475569', margin: 0 }}>
            Es gab einen schweren Fehler beim Start. Lade die Seite neu —
            falls das Problem bleibt, lösche bitte den Browser-Cache.
          </p>
          {error.digest && (
            <p
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                fontSize: 10,
                marginTop: 12,
                color: '#94a3b8',
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              ref: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 20,
              padding: '10px 22px',
              fontSize: 14,
              fontWeight: 600,
              border: 'none',
              borderRadius: 12,
              background: '#2563eb',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            Neu laden
          </button>
        </div>
      </body>
    </html>
  );
}
