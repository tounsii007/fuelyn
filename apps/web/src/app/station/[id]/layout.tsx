// Metadata + structured data for the dynamic station-detail route.
//
// We deliberately avoid a network fetch here: station detail comes
// from an external backend / Tankerkoenig (may be unavailable, needs
// an API key, adds latency), and a throwing generateMetadata would
// break the page. Instead we derive a UNIQUE canonical + breadcrumb
// per station id — the important SEO signals (no duplicate content,
// SERP breadcrumb) — with solid generic copy. A station-name-aware
// title / GasStation schema can be layered on later via a cached lookup.

import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { RouteJsonLd } from '@/components/seo/RouteJsonLd';

const TITLE = 'Tankstelle — Preise, Öffnungszeiten & Route';
const DESCRIPTION =
  'Aktuelle Spritpreise, Öffnungszeiten und Anfahrt für diese Tankstelle. ' +
  'Vergleiche Diesel, Super E5 und E10 und plane deinen günstigsten Tankstopp.';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const path = `/station/${encodeURIComponent(id)}`;
  const ogImage = `/og?title=${encodeURIComponent(TITLE)}&subtitle=${encodeURIComponent(DESCRIPTION)}`;
  const images = [{ url: ogImage, width: 1200, height: 630, alt: `${TITLE} · Fuelyn` }];
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: path },
    openGraph: { title: `${TITLE} · Fuelyn`, description: DESCRIPTION, url: path, images },
    twitter: { title: `${TITLE} · Fuelyn`, description: DESCRIPTION, images },
  };
}

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <RouteJsonLd
        name="Tankstelle"
        path={`/station/${encodeURIComponent(id)}`}
        description={DESCRIPTION}
      />
      {children}
    </>
  );
}
