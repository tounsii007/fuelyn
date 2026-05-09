// ============================================================
// InstallPrompt — Phase A4
//
// Owns the `beforeinstallprompt` lifecycle and renders a low-key
// banner offering the user to install Fuelyn as a PWA.
//
// Design:
//   • Catches the BIP event so Chromium doesn't show its default
//     "Install app" mini-infobar.
//   • Suppresses itself for 30 days after a "Not now" dismiss.
//   • Hides for users that already added the app to the home
//     screen (display-mode: standalone) or installed via the
//     OS-level prompt (appinstalled event).
//   • Registers `/sw.js` opportunistically — a missing/failed
//     register doesn't break the page.
// ============================================================

'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'fy:install-prompt-dismissed-at';
const SUPPRESS_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: ReadonlyArray<string>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  prompt(): Promise<void>;
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  // Service-worker registration — fire-and-forget. The `Permissions-Policy`
  // header allows it; any failure (no SW support, opaque mismatch, etc.)
  // just means we serve straight from network like before.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // `load` is the right hook because the SW shouldn't compete with
    // critical-path resources during initial paint.
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.debug('[Fuelyn] SW register skipped:', err?.message ?? err);
      });
    };
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Already installed? Nothing to do.
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari uses a different signal.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigator as any).standalone === true;
    if (isStandalone) return;

    // Suppressed by recent dismiss?
    try {
      const last = Number(localStorage.getItem(STORAGE_KEY) ?? '0');
      if (last && Date.now() - last < SUPPRESS_MS) return;
    } catch {
      // localStorage may throw in private mode — fall through.
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function accept() {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      // ignore — Chrome occasionally double-fires the prompt.
    } finally {
      setVisible(false);
      setDeferred(null);
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      // best-effort
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="App installieren"
      className="fixed left-3 right-3 bottom-3 sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-sm
                 z-[60] rounded-2xl shadow-2xl shadow-black/20
                 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl
                 ring-1 ring-black/5 dark:ring-white/10
                 p-4 fy-enter"
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="w-10 h-10 rounded-xl bg-brand-500/10 dark:bg-brand-500/20
                     flex items-center justify-center text-2xl shrink-0"
        >
          {'⚡'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Fuelyn als App installieren
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-gray-600 dark:text-gray-400">
            Schneller Start, Offline-Karte, Push-Alerts bei Preis-Drops. Kein App-Store nötig.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={accept}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold
                         bg-brand-600 text-white hover:bg-brand-700
                         active:scale-[0.97] transition-all duration-150
                         focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            >
              Installieren
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="px-3 py-1.5 rounded-lg text-xs font-medium
                         text-gray-600 hover:text-gray-900
                         dark:text-gray-400 dark:hover:text-gray-100"
            >
              Später
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
