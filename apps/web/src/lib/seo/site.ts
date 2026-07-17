// ============================================================
// SEO / site-wide constants (Iteration 1 — SEO foundation).
//
// Single source of truth for canonical URL, brand copy, and the
// helpers used by sitemap.ts, robots.ts, the root-layout metadata,
// and the JSON-LD structured data. Unlike `config/runtime.ts`, the
// URL resolver here NEVER throws — metadata generation and `next
// build` must succeed even when the runtime origin env is unset, so
// we fall back to the canonical production domain.
// ============================================================

/** Canonical production origin — used as the metadata/OG/sitemap base. */
export const SITE_URL = (
  process.env.FUELYN_PUBLIC_ORIGIN ||
  process.env.NEXT_PUBLIC_APP_ORIGIN ||
  'https://fuelyn.app'
).replace(/\/$/, '');

export const SITE_NAME = 'Fuelyn';

export const SITE_TITLE = 'Fuelyn — AI-powered fuel intelligence';

export const SITE_TITLE_TEMPLATE = '%s · Fuelyn';

export const SITE_DESCRIPTION =
  'Fuelyn findet die klügste Tankstelle, sagt Preis-Tiefpunkte voraus und macht ' +
  'aus jedem Tankstopp eine datengestützte Entscheidung — nicht nur die billigste, ' +
  'die sinnvollste.';

export const SITE_DESCRIPTION_EN =
  'Fuelyn finds the smartest gas station, predicts fuel-price drops, and turns ' +
  'every refuel into a data-driven decision.';

export const SITE_LOCALE = 'de_DE';

export const TWITTER_HANDLE = '@fuelyn';

export const SITE_KEYWORDS = [
  'Fuelyn',
  'Tankstelle',
  'Spritpreise',
  'Benzinpreise',
  'Diesel Preis',
  'Super E5',
  'Super E10',
  'günstig tanken',
  'Tankstellen Finder',
  'Fuel prices',
  'AI fuel advisor',
  'Deutschland',
];

/** Build an absolute URL from a site-relative path. */
export function absoluteUrl(path = '/'): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
