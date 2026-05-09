// ============================================================
// Root Layout
// ============================================================

import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import { NO_FLASH_SCRIPT } from '@/lib/theme/ThemeProvider';
import { WebVitalsReporter } from '@/components/observability/WebVitalsReporter';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Fuelyn — AI-powered fuel intelligence',
  description:
    'Fuelyn finds the smartest gas station, predicts fuel-price drops, and turns every refuel into a data-driven decision.',
  keywords: [
    'Fuelyn',
    'Tankstelle',
    'Spritpreise',
    'Fuel prices',
    'AI fuel advisor',
    'Diesel',
    'Super E5',
    'Super E10',
    'Deutschland',
  ],
  authors: [{ name: 'Fuelyn' }],
  manifest: '/manifest.json',
  openGraph: {
    title: 'Fuelyn — AI-powered fuel intelligence',
    description: 'Smart fuel decisions, every refuel.',
    type: 'website',
    locale: 'de_DE',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    // Match the new cinematic navy from tokens.css
    { media: '(prefers-color-scheme: dark)', color: '#0a0f1d' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        {/* Inline theme script: applies persisted/system theme before paint
            to eliminate FOUC. Implementation in lib/theme/ThemeProvider.ts. */}
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
        {/* Preconnect to external CDNs for faster resource loading */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Preconnect to map tile servers */}
        <link rel="preconnect" href="https://a.basemaps.cartocdn.com" />
        <link rel="preconnect" href="https://b.basemaps.cartocdn.com" />
        {/* Leaflet CSS is imported in StationMap.tsx — no CDN duplicate needed */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased bg-surface-secondary dark:bg-surface-dark text-gray-900 dark:text-gray-100">
        <WebVitalsReporter />
        <Providers>{children}</Providers>
        <InstallPrompt />
      </body>
    </html>
  );
}
