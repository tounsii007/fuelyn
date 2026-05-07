// ============================================================
// Client Providers — React Query + Hydration
// ============================================================

'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useHydrateStore } from '@/lib/hooks/use-vehicle';
import { useAppStore } from '@/lib/store/app-store';
import { SplashScreen } from '@/components/splash/SplashScreen';
import { OfflineBanner } from '@/components/layout/OfflineBanner';
import { ThemeProvider } from '@/lib/theme/ThemeProvider';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { ToastProvider } from '@/components/ui/Toast';
import { GeoFenceMount } from '@/lib/geo/GeoFenceMount';

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

  // Apply the chosen background variant to <html> so the .tp-mesh
  // utility (used everywhere the gradient backdrop appears) picks
  // up the matching CSS rule from tokens.css.
  useEffect(() => {
    document.documentElement.dataset.bg = background ?? 'aurora';
  }, [background]);

  return null;
}

function ServiceWorkerRegistrar() {
  useEffect(() => {
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
    if (sessionStorage.getItem('tp_splash_done')) {
      setShowSplash(false);
    } else {
      setSplashReady(true);
    }
  }, []);

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
    sessionStorage.setItem('tp_splash_done', '1');
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <StoreHydrator>
            <ThemeSync />
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
  );
}
