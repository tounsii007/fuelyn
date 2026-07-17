// ============================================================
// Per-route metadata helper (Iteration 2 — per-route metadata).
//
// Each route segment ships a tiny server `layout.tsx` that calls
// this to declare a unique title, description and canonical URL.
// Keeps the ~13 route layouts DRY and guarantees consistent
// canonical/robots handling. Private tool pages pass index:false
// so they stay out of the index (matching robots.ts).
// ============================================================

import type { Metadata } from 'next';

export type PageMetaInput = {
  /** Page title WITHOUT the brand suffix — the root template adds "· Fuelyn". */
  title: string;
  description: string;
  /** Site-relative canonical path, e.g. "/compare". */
  path: string;
  /** false → noindex,follow for private per-user tool pages. Default true. */
  index?: boolean;
};

export function pageMetadata({ title, description, path, index = true }: PageMetaInput): Metadata {
  // Per-route social card: /og renders a branded 1200×630 image with
  // this page's own title/subtitle, so shared sub-page links look
  // intentional instead of the generic home image.
  const ogImage = `/og?title=${encodeURIComponent(title)}&subtitle=${encodeURIComponent(description)}`;
  const ogImages = [{ url: ogImage, width: 1200, height: 630, alt: `${title} · Fuelyn` }];

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} · Fuelyn`,
      description,
      url: path,
      images: ogImages,
    },
    twitter: {
      title: `${title} · Fuelyn`,
      description,
      images: ogImages,
    },
    robots: index
      ? undefined // inherit the indexable root robots directives
      : { index: false, follow: true },
  };
}
