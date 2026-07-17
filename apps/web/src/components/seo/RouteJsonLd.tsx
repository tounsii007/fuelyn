// ============================================================
// Per-page structured data (Iteration 7 — per-page SEO).
//
// Rendered once per route (from the route's server layout.tsx).
// Emits two schema.org nodes tied back to the site-wide graph in
// JsonLd.tsx:
//   • BreadcrumbList  → enables SERP breadcrumb trails (Home › Page)
//   • WebPage/subtype → a proper page entity linked to the WebSite,
//     which strengthens topical/entity signals per URL.
// Server component — ships no client JS.
// ============================================================

import { SITE_URL, SITE_NAME, absoluteUrl } from '@/lib/seo/site';

type PageType = 'WebPage' | 'CollectionPage' | 'AboutPage' | 'ProfilePage';

export interface RouteJsonLdProps {
  /** Human page name, also used as the last breadcrumb crumb. */
  name: string;
  /** Site-relative path, e.g. "/compare". */
  path: string;
  description: string;
  /** schema.org page type; defaults to WebPage. */
  type?: PageType;
}

export function RouteJsonLd({ name, path, description, type = 'WebPage' }: RouteJsonLdProps) {
  const url = absoluteUrl(path);
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Start',
            item: SITE_URL,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name,
            item: url,
          },
        ],
      },
      {
        '@type': type,
        '@id': `${url}#webpage`,
        url,
        name: `${name} · ${SITE_NAME}`,
        description,
        inLanguage: 'de-DE',
        isPartOf: { '@id': `${SITE_URL}/#website` },
        breadcrumb: { '@id': `${url}#breadcrumb` },
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // Built entirely from trusted constants + route props.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
