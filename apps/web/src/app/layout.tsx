// ============================================================
// Root Layout
// ============================================================

import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import { NO_FLASH_SCRIPT } from '@/lib/theme/ThemeProvider';
import { WebVitalsReporter } from '@/components/observability/WebVitalsReporter';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { SkipLink } from '@/components/layout/SkipLink';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  SITE_URL,
  SITE_NAME,
  SITE_TITLE,
  SITE_TITLE_TEMPLATE,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_LOCALE,
  TWITTER_HANDLE,
} from '@/lib/seo/site';
import '@/styles/globals.css';

// Self-hosted Inter via next/font — eliminates the render-blocking
// Google Fonts <link>, the extra CDN round-trip and preconnects, and
// the FOUT/CLS that came with them. `display: 'swap'` + size-adjust
// metrics fallback keep text visible immediately with no layout shift.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  fallback: ['system-ui', 'arial'],
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  // Absolute base for resolving canonical/OG/Twitter URLs.
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: SITE_TITLE_TEMPLATE,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: SITE_KEYWORDS,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: 'travel',
  manifest: '/manifest.json',
  alternates: {
    canonical: '/',
  },
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: SITE_NAME,
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    type: 'website',
    locale: SITE_LOCALE,
    url: SITE_URL,
    siteName: SITE_NAME,
    // /opengraph-image is picked up automatically, but declaring it
    // keeps the tag explicit for validators.
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: TWITTER_HANDLE,
    creator: TWITTER_HANDLE,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // No maximumScale/userScalable lock — users must be able to pinch-zoom
  // (WCAG 2.1 SC 1.4.4 Resize Text). Capping the scale traps low-vision users.
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
    <html lang="de" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Inline theme script: applies persisted/system theme before paint
            to eliminate FOUC. Implementation in lib/theme/ThemeProvider.ts. */}
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
        {/* Preconnect to map tile servers (fonts are now self-hosted via
            next/font, so no fonts.googleapis/gstatic preconnect needed). */}
        <link rel="preconnect" href="https://a.basemaps.cartocdn.com" />
        <link rel="preconnect" href="https://b.basemaps.cartocdn.com" />
        {/* Leaflet CSS is imported in StationMap.tsx — no CDN duplicate needed */}
      </head>
      <body className="font-sans antialiased bg-surface-secondary dark:bg-surface-dark text-gray-900 dark:text-gray-100">
        <JsonLd />
        <SkipLink />
        <WebVitalsReporter />
        <Providers>{children}</Providers>
        <InstallPrompt />
      </body>
    </html>
  );
}
