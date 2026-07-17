// ============================================================
// XML sitemap (Iteration 1 — SEO foundation).
//
// Served at /sitemap.xml. Lists the publicly indexable routes so
// crawlers can discover the full surface. Private, per-user tool
// pages (settings, favorites, fuel-log, vehicle, alerts) are
// intentionally excluded here and disallowed in robots.ts.
//
// Dynamic /station/[id] pages are not enumerated yet (would need a
// DB pass over all stations) — that can be added as a dedicated
// dynamic sitemap in a later iteration.
// ============================================================

import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo/site';

// A fixed reference date keeps `lastModified` stable across builds
// (the app deploys frequently; churning the timestamp every build
// gives crawlers no useful signal). Bump when content structure
// materially changes.
const LAST_MODIFIED = new Date('2026-07-17');

type Entry = {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: number;
};

const ROUTES: Entry[] = [
  { path: '/', changeFrequency: 'hourly', priority: 1.0 },
  { path: '/locations', changeFrequency: 'daily', priority: 0.9 },
  { path: '/compare', changeFrequency: 'daily', priority: 0.8 },
  { path: '/route-planner', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/stats', changeFrequency: 'daily', priority: 0.7 },
  { path: '/partners', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/achievements', changeFrequency: 'weekly', priority: 0.5 },
  { path: '/ai-chat', changeFrequency: 'weekly', priority: 0.5 },
  { path: '/wrapped', changeFrequency: 'monthly', priority: 0.4 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: LAST_MODIFIED,
    changeFrequency,
    priority,
  }));
}
