// ============================================================
// Route segment factory (Iteration 7 — per-page SEO).
//
// One call per route produces BOTH the page `metadata` and a server
// Layout that injects per-page structured data (breadcrumb + page
// entity). Keeps the ~13 route layouts to two lines each and
// guarantees title/description/canonical/JSON-LD stay in sync.
//
//   const seg = routeSegment({ title, description, path });
//   export const metadata = seg.metadata;
//   export default seg.Layout;
// ============================================================

import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { pageMetadata, type PageMetaInput } from './metadata';
import { RouteJsonLd, type RouteJsonLdProps } from '@/components/seo/RouteJsonLd';

export type RouteSegmentInput = PageMetaInput & {
  /** schema.org page type for the structured data; defaults to WebPage. */
  type?: RouteJsonLdProps['type'];
};

export function routeSegment(input: RouteSegmentInput) {
  const metadata: Metadata = pageMetadata(input);

  // Private, noindex pages don't need structured data — search
  // engines never index them, so the breadcrumb/page entity is dead
  // weight. Only indexable pages get the JSON-LD.
  const emitJsonLd = input.index !== false;

  function Layout({ children }: { children: ReactNode }) {
    return (
      <>
        {emitJsonLd && (
          <RouteJsonLd
            name={input.title}
            path={input.path}
            description={input.description}
            type={input.type}
          />
        )}
        {children}
      </>
    );
  }
  Layout.displayName = `RouteLayout(${input.path})`;

  return { metadata, Layout };
}
