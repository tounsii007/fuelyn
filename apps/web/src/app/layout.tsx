// ============================================================
// Root Layout
// ============================================================

import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import { NO_FLASH_SCRIPT } from '@/lib/theme/ThemeProvider';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'TankPilot - Günstig & schlau tanken',
  description:
    'Finde die beste Tankstelle in deiner Nähe. Nicht nur die billigste - die sinnvollste.',
  keywords: ['Tankstelle', 'Spritpreise', 'Benzinpreise', 'Diesel', 'Super E5', 'Super E10', 'Deutschland'],
  authors: [{ name: 'TankPilot' }],
  manifest: '/manifest.json',
  openGraph: {
    title: 'TankPilot - Günstig & schlau tanken',
    description: 'Finde die beste Tankstelle in deiner Nähe.',
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
    { media: '(prefers-color-scheme: dark)', color: '#0F172A' },
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
