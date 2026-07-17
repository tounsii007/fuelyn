// ============================================================
// robots.txt (Iteration 1 — SEO foundation).
//
// Served at /robots.txt. Allows general crawling of public
// content, blocks API endpoints and per-user tool pages that
// carry no SEO value (and could leak query params into the
// index), and points crawlers at the sitemap.
// ============================================================

import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/settings',
          '/favorites',
          '/fuel-log',
          '/vehicle',
          '/alerts',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
