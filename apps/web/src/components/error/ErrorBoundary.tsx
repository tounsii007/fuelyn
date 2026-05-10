// ============================================================
// ErrorBoundary — root-level React-error firewall.
//
// React error boundaries catch render-phase exceptions, hook-rule
// violations, and runtime crashes inside the wrapped subtree.
// Without one, a single component throw kills the whole tree and
// the user lands on Chrome's blank "couldn't load" overlay (we
// experienced this firsthand with the StationList #310 bug).
//
// This boundary:
//   - Renders a friendly fallback with a Reload + Reset button
//   - Logs the full error stack to console for in-prod triage
//   - Persists nothing — a reload always works because the next
//     render gets a fresh boundary state
//   - Resets cleanly when its `resetKey` prop changes (used to
//     auto-clear after route navigation if mounted higher up)
//
// Pure class component because hook-based error boundaries don't
// exist yet (React 19) — `getDerivedStateFromError` is class-only.
// ============================================================

'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Optional render-prop fallback. Called with the caught error
   * and a `reset()` function so consumers can render their own
   * recovery UI. When omitted, the default fallback is shown.
   */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /**
   * Changing this value resets the boundary back to its non-error
   * state. Useful when remounting after a route change so a single
   * crash on one page doesn't poison subsequent navigations.
   */
  resetKey?: unknown;
  /** Optional error sink — fires on every caught error. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    // Reset when resetKey transitions to a new value — lets the
    // user navigate away from a crashed page without manually
    // clicking Reload.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Always log — production minified errors are unfriendly but
    // include the React-error-decoder URL when applicable.
    // eslint-disable-next-line no-console
    console.error('[Fuelyn ErrorBoundary] Render crashed:', error, info.componentStack);
    this.props.onError?.(error, info);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return <DefaultFallback error={this.state.error} reset={this.reset} />;
    }
    return this.props.children;
  }
}

/**
 * Minimal locale dictionary for the error fallback. We deliberately
 * DO NOT call `useTranslations()` here: the boundary catches every
 * render-phase exception below it, including ones that originate
 * inside the translations system or the Zustand store that backs it.
 * If t() were the source of the crash, the fallback itself would
 * crash too — and the user would see Chrome's blank "couldn't load"
 * overlay all over again.
 *
 * Instead we read the browser language directly (window-only API,
 * no React state) and pick from a tiny inline dictionary covering
 * the four supported locales. Falls back to English when nothing
 * matches.
 */
const FALLBACK_STRINGS = {
  de: {
    headline: 'Etwas ist schiefgegangen',
    body:
      'Die App ist auf einen Fehler gestoßen und konnte den aktuellen Bildschirm nicht weiter rendern. Du kannst entweder neu laden oder zurück zur Startseite. Deine gespeicherten Daten (Favoriten, Fahrzeug, Einstellungen) bleiben erhalten.',
    reload: 'Seite neu laden',
    home: 'Zur Startseite',
  },
  en: {
    headline: 'Something went wrong',
    body:
      'The app hit an error and could not finish rendering this screen. You can reload or go back to the home page. Your saved data (favorites, vehicle, settings) is preserved.',
    reload: 'Reload page',
    home: 'Go home',
  },
  'en-US': {
    headline: 'Something went wrong',
    body:
      'The app hit an error and could not finish rendering this screen. You can reload or go back to the home page. Your saved data (favorites, vehicle, settings) is preserved.',
    reload: 'Reload page',
    home: 'Go home',
  },
  fr: {
    headline: 'Une erreur est survenue',
    body:
      'L’application a rencontré une erreur et n’a pas pu finir d’afficher cet écran. Vous pouvez recharger ou revenir à l’accueil. Vos données enregistrées (favoris, véhicule, paramètres) sont conservées.',
    reload: 'Recharger la page',
    home: 'Retour à l’accueil',
  },
} as const;

function pickFallbackLocale(): keyof typeof FALLBACK_STRINGS {
  if (typeof navigator === 'undefined') return 'en';
  const lang = (navigator.language ?? '').toLowerCase();
  if (lang.startsWith('de')) return 'de';
  if (lang.startsWith('fr')) return 'fr';
  if (lang === 'en-us' || lang.startsWith('en-us')) return 'en-US';
  return 'en';
}

function DefaultFallback({ error, reset }: { error: Error; reset: () => void }) {
  const strings = FALLBACK_STRINGS[pickFallbackLocale()];
  // Intentionally locale-independent and dependency-free: this UI
  // must work even when the rest of the app (i18n, theme tokens,
  // Tailwind's CSS variables) isn't reachable. Inline styles only.
  const wrapperStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1.5rem',
    backgroundColor: '#0a0f1d',
    color: '#f1f5f9',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    zIndex: 9999,
  };
  const cardStyle: React.CSSProperties = {
    maxWidth: '32rem',
    width: '100%',
    padding: '2rem',
    borderRadius: '1.5rem',
    border: '1px solid rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  };
  const headlineStyle: React.CSSProperties = {
    fontSize: '1.5rem',
    fontWeight: 700,
    margin: '0 0 0.75rem',
  };
  const bodyStyle: React.CSSProperties = {
    fontSize: '0.875rem',
    lineHeight: 1.6,
    color: '#94a3b8',
    margin: '0 0 1.5rem',
  };
  const detailStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    fontFamily: 'ui-monospace, "SF Mono", monospace',
    padding: '0.75rem 1rem',
    borderRadius: '0.5rem',
    backgroundColor: 'rgba(0,0,0,0.3)',
    color: '#f87171',
    margin: '0 0 1.5rem',
    overflowX: 'auto',
  };
  const btnRow: React.CSSProperties = {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap',
  };
  const primaryBtn: React.CSSProperties = {
    flex: '1 1 auto',
    padding: '0.75rem 1.25rem',
    borderRadius: '0.75rem',
    border: 'none',
    backgroundColor: '#3b82f6',
    color: 'white',
    fontWeight: 600,
    fontSize: '0.875rem',
    cursor: 'pointer',
  };
  const secondaryBtn: React.CSSProperties = {
    flex: '1 1 auto',
    padding: '0.75rem 1.25rem',
    borderRadius: '0.75rem',
    border: '1px solid rgba(255,255,255,0.2)',
    backgroundColor: 'transparent',
    color: '#f1f5f9',
    fontWeight: 600,
    fontSize: '0.875rem',
    cursor: 'pointer',
  };

  // Best effort to keep the message concise and readable. Production
  // React errors come pre-formatted with a "Minified React error #N"
  // prefix and a link — we surface that as the headline so the user
  // (or developer over their shoulder) can look it up immediately.
  const message = error.message || 'Unknown error';

  return (
    <div role="alert" aria-live="assertive" style={wrapperStyle}>
      <div style={cardStyle}>
        <h1 style={headlineStyle}>{strings.headline}</h1>
        <p style={bodyStyle}>{strings.body}</p>
        <pre style={detailStyle}>{message}</pre>
        <div style={btnRow}>
          <button
            type="button"
            style={primaryBtn}
            onClick={() => {
              reset();
              if (typeof window !== 'undefined') {
                window.location.reload();
              }
            }}
          >
            {strings.reload}
          </button>
          <button
            type="button"
            style={secondaryBtn}
            onClick={() => {
              reset();
              if (typeof window !== 'undefined') {
                window.location.href = '/';
              }
            }}
          >
            {strings.home}
          </button>
        </div>
      </div>
    </div>
  );
}
