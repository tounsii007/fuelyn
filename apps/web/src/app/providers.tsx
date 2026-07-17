// ============================================================
// Client Providers — React Query + Hydration
// ============================================================

'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useHydrateStore } from '@/lib/hooks/use-vehicle';
import { useCloudSync } from '@/lib/hooks/use-cloud-sync';
import { useTelemetry } from '@/lib/hooks/use-telemetry';
import { useAppStore } from '@/lib/store/app-store';
import { SplashScreen } from '@/components/splash/SplashScreen';
import { OfflineBanner } from '@/components/layout/OfflineBanner';
import { ThemeProvider } from '@/lib/theme/ThemeProvider';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { ToastProvider } from '@/components/ui/Toast';
import { GeoFenceMount } from '@/lib/geo/GeoFenceMount';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';

function ThemeSync() {
  const theme = useAppStore((s) => s.settings.theme);
  const background = useAppStore((s) => s.settings.background);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'light') {
      root.classList.remove('dark');
    } else {
      // system
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const apply = () => {
        if (mq.matches) root.classList.add('dark');
        else root.classList.remove('dark');
      };
      apply();
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [theme]);

  // Apply the chosen background variant to <html> so the .fy-mesh
  // utility (used everywhere the gradient backdrop appears) picks
  // up the matching CSS rule from tokens.css.
  //
  // Defensive fallback: if the persisted settings predate the
  // `background` field (older app versions) we coerce to 'aurora'
  // so the user never lands on an undefined value.
  useEffect(() => {
    const root = document.documentElement;
    const variant = background && typeof background === 'string' ? background : 'aurora';
    root.setAttribute('data-bg', variant);
    // Mirror to dataset for code that prefers the typed accessor.
    root.dataset.bg = variant;
  }, [background]);

  return null;
}

// Keep <html lang> in sync with the active UI locale (a11y / SEO —
// WCAG 3.1.1/3.1.2). The document ships lang="de" from the server;
// when the user switches language, screen readers and search engines
// must see the matching BCP-47 tag instead of stale "de". Set via an
// effect (post-mount) so there's no hydration mismatch — same pattern
// as the theme/background sync above.
const LOCALE_TO_BCP47: Record<string, string> = {
  de: 'de',
  en: 'en-GB',
  'en-US': 'en-US',
  fr: 'fr',
};

function LangSync() {
  const locale = useAppStore((s) => s.settings.locale);
  useEffect(() => {
    document.documentElement.lang = LOCALE_TO_BCP47[locale] ?? 'de';
  }, [locale]);
  return null;
}

function ServiceWorkerRegistrar() {
  useEffect(() => {
    // Escape hatch: NEXT_PUBLIC_DISABLE_SW=1 turns the service worker
    // off entirely (set by docker-compose.dev.yml). In dev the SW
    // caches aggressively, breaks hot-reload and can serve a stale
    // offline shell — so when disabled we also proactively UNREGISTER
    // any SW a previous session already installed and drop its caches.
    if (process.env.NEXT_PUBLIC_DISABLE_SW === '1') {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((r) => r.unregister());
        });
        if (typeof caches !== 'undefined') {
          caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
        }
      }
      return;
    }

    // Only register service worker in production or on localhost
    // Network dev access (phone on same WiFi) doesn't support SW well
    const isLocalhost =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const isProd = process.env.NODE_ENV === 'production';

    if ('serviceWorker' in navigator && (isProd || isLocalhost)) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Silently ignore — SW registration can fail in dev mode
      });
    }
  }, []);
  return null;
}

function StoreHydrator({ children }: { children: React.ReactNode }) {
  useHydrateStore();
  // Cloud-sync runs alongside local hydration: pulls any newer
  // server records into the store, then push-mirrors local
  // changes after a 1.5 s debounce. No-ops on the server.
  useCloudSync();
  // Telemetry: privacy-respecting event batcher. Fires app.first-open
  // on mount and flushes the buffer every 30 s + on page hide.
  useTelemetry();
  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 2,
            refetchOnWindowFocus: true,
            staleTime: 30_000,
          },
        },
      }),
  );

  const [showSplash, setShowSplash] = useState(true);
  const [splashReady, setSplashReady] = useState(false);

  // Check sessionStorage on client only to avoid hydration mismatch
  useEffect(() => {
    if (sessionStorage.getItem('fuelyn:splash_done')) {
      setShowSplash(false);
    } else {
      setSplashReady(true);
    }
  }, []);

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
    sessionStorage.setItem('fuelyn:splash_done', '1');
  }, []);

  return (
    // Root-level firewall: any render-phase exception below this
    // boundary surfaces as a friendly fallback instead of Chrome's
    // blank "couldn't load" overlay. Mounted at the providers level
    // so the boundary itself doesn't depend on QueryClient/ThemeProvider —
    // those CAN fail, and we still want to show the fallback UI.
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ToastProvider>
            <StoreHydrator>
              <ThemeSync />
              <LangSync />
              <ServiceWorkerRegistrar />
              <OfflineBanner />
              <CommandPalette />
              <GeoFenceMount />
              {showSplash && splashReady && <SplashScreen onComplete={handleSplashComplete} />}
              {children}
            </StoreHydrator>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
