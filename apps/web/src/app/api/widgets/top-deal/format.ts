// ============================================================
// Pure helpers for the Top-Deal PWA widget.
// Extracted from route.ts so they can be unit-tested without
// pulling in the Next.js request runtime.
// ============================================================

import type { FuelType, Station } from '@fuelyn/core';

export const FUEL_LABELS: Record<FuelType, string> = {
  e10: 'E10',
  e5: 'Super E5',
  diesel: 'Diesel',
};

/**
 * German-style price string for €/L:
 *   1.749  -> "1,749"
 *   1.700  -> "1,7"   (trailing zeros stripped)
 *   1.000  -> "1"
 */
export function formatPriceDe(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return value
    .toFixed(3)
    .replace('.', ',')
    .replace(/0+$/, '')
    .replace(/,$/, '');
}

/** km with 1-decimal under 10 km, integer above. */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) return '—';
  return km < 10 ? km.toFixed(1) : Math.round(km).toString();
}

/** Locale-aware "vor 4 Min." style relative time. */
export function formatRelative(date: Date | null, locale: string = 'de'): string {
  if (!date) return locale.startsWith('de') ? 'gerade eben' : 'just now';
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return locale.startsWith('de') ? 'gerade eben' : 'just now';

  const rtf = new Intl.RelativeTimeFormat(
    locale.startsWith('de') ? 'de' : 'en',
    { numeric: 'auto' },
  );
  if (seconds < 3600) return rtf.format(-Math.round(seconds / 60), 'minute');
  if (seconds < 86_400) return rtf.format(-Math.round(seconds / 3600), 'hour');
  return rtf.format(-Math.round(seconds / 86_400), 'day');
}

export function buildAddress(station: Station): string {
  const street = station.houseNumber
    ? `${station.street} ${station.houseNumber}`
    : station.street;
  const cityLine = [station.postCode, station.place]
    .filter((part) => part && String(part).trim())
    .join(' ');
  return [street, cityLine]
    .filter((part) => part && String(part).trim())
    .join(', ');
}

export function priceFor(station: Station, fuel: FuelType): number | null {
  const p = station.prices?.[fuel];
  return typeof p === 'number' && p > 0 ? p : null;
}

/** Cheapest open station for the given fuel. Returns null if none. */
export function pickCheapest(stations: Station[], fuel: FuelType): Station | null {
  let best: Station | null = null;
  let bestPrice = Number.POSITIVE_INFINITY;
  for (const s of stations) {
    if (s.isOpen === false) continue;
    const p = priceFor(s, fuel);
    if (p == null || p >= bestPrice) continue;
    bestPrice = p;
    best = s;
  }
  return best;
}

export interface WidgetData {
  $schema: string;
  stationBrand: string;
  address: string;
  pricePerLiter: string;
  distanceKm: string;
  fuelType: string;
  updatedRelative: string;
  deepLink: string;
}

export function buildEmpty(locale: string): WidgetData {
  return {
    $schema: 'https://adaptivecards.io/schemas/adaptive-card.json',
    stationBrand: 'Fuelyn',
    address: locale.startsWith('de')
      ? 'Keine Tankstelle in Reichweite'
      : 'No station in range',
    pricePerLiter: '—',
    distanceKm: '—',
    fuelType: 'E10',
    updatedRelative: locale.startsWith('de') ? 'gerade eben' : 'just now',
    deepLink: '/?source=widget-top-deal',
  };
}
