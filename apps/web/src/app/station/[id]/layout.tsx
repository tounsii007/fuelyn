// Metadata for the dynamic station-detail route.
//
// We deliberately avoid a network fetch here: station detail comes
// from an external backend / Tankerkoenig (may be unavailable, needs
// an API key, adds latency), and a throwing generateMetadata would
// break the page. Instead we derive a UNIQUE canonical per station id
// — which is the important SEO signal (no duplicate content) — with
// solid generic copy. A station-name-aware title can be layered on
// later via a cached lookup.

import type { ReactNode } from 'react';
import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const path = `/station/${encodeURIComponent(id)}`;
  const title = 'Tankstelle — Preise, Öffnungszeiten & Route';
  const description =
    'Aktuelle Spritpreise, Öffnungszeiten und Anfahrt für diese Tankstelle. ' +
    'Vergleiche Diesel, Super E5 und E10 und plane deinen günstigsten Tankstopp.';
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title: `${title} · Fuelyn`, description, url: path },
    twitter: { title: `${title} · Fuelyn`, description },
  };
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
