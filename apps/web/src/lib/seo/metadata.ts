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
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} · Fuelyn`,
      description,
      url: path,
    },
    twitter: {
      title: `${title} · Fuelyn`,
      description,
    },
    robots: index
      ? undefined // inherit the indexable root robots directives
      : { index: false, follow: true },
  };
}
