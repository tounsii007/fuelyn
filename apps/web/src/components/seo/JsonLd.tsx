// ============================================================
// Structured data / JSON-LD (Iteration 1 — SEO foundation).
//
// Emits schema.org markup so search engines can render rich
// results (sitelinks search box, app/organization knowledge
// panel). Rendered once in the root layout. Server component —
// no client JS shipped.
// ============================================================

import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, absoluteUrl } from '@/lib/seo/site';

const graph = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: absoluteUrl('/icon.svg'),
      description: SITE_DESCRIPTION,
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: 'de-DE',
      publisher: { '@id': `${SITE_URL}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${SITE_URL}/locations?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'WebApplication',
      '@id': `${SITE_URL}/#webapp`,
      name: SITE_NAME,
      url: SITE_URL,
      applicationCategory: 'TravelApplication',
      operatingSystem: 'Web, iOS, Android',
      description: SITE_DESCRIPTION,
      inLanguage: 'de-DE',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'EUR',
      },
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ],
};

export function JsonLd() {
  return (
    <script
      type="application/ld+json"
      // Content is fully static and built from trusted constants.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
