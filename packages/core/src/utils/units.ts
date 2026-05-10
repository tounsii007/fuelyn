// ============================================================
// Locale-aware unit conversion (Iter AG)
//
// The web app supports 4 locales (de, en, en-US, fr). Three of
// them are metric (km, litres, °C, EUR). en-US wants miles,
// gallons, °F, USD. Without these helpers we'd ship "1.74 €/L"
// to a Texas user — accurate but surreal.
//
// Pure functions, no I/O. Each conversion uses the canonical
// factors (1 mi = 1.609344 km exactly; 1 US gal = 3.785411784 L
// exactly).
// ============================================================

export type UnitSystem = 'metric' | 'imperial';

const KM_PER_MILE = 1.609344;
const LITRES_PER_US_GAL = 3.785411784;

/** True iff the user's locale prefers imperial units. */
export function unitSystemForLocale(locale: string): UnitSystem {
  return locale.toLowerCase() === 'en-us' ? 'imperial' : 'metric';
}

// -----------------------------------------------------------------
// Distance
// -----------------------------------------------------------------

export function kmToMiles(km: number): number {
  return km / KM_PER_MILE;
}

export function milesToKm(miles: number): number {
  return miles * KM_PER_MILE;
}

/** Format a km value with the appropriate locale unit. */
export function formatDistanceLocalized(km: number, locale: string): string {
  if (!Number.isFinite(km)) return '—';
  if (unitSystemForLocale(locale) === 'imperial') {
    const mi = kmToMiles(km);
    return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
  }
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

// -----------------------------------------------------------------
// Volume
// -----------------------------------------------------------------

export function litresToGallons(l: number): number {
  return l / LITRES_PER_US_GAL;
}

export function gallonsToLitres(g: number): number {
  return g * LITRES_PER_US_GAL;
}

// -----------------------------------------------------------------
// Price
// -----------------------------------------------------------------

/**
 * Convert a €/L price to a $/gal price.
 * Caller passes the exchange rate; we don't fetch one — that lives
 * in the BFF and is cached separately.
 */
export function eurPerLiterToUsdPerGallon(
  eurPerLiter: number,
  usdPerEur: number = 1.08,
): number {
  return eurPerLiter * usdPerEur * LITRES_PER_US_GAL;
}

/** Format a price for display. */
export function formatPriceLocalized(
  eurPerLiter: number,
  locale: string,
  usdPerEur: number = 1.08,
): string {
  if (!Number.isFinite(eurPerLiter)) return '—';
  if (unitSystemForLocale(locale) === 'imperial') {
    const usd = eurPerLiterToUsdPerGallon(eurPerLiter, usdPerEur);
    return `$${usd.toFixed(2)}/gal`;
  }
  // Metric: 3 decimals with comma in DE/FR, dot in EN.
  const sep = locale.toLowerCase().startsWith('de') || locale.toLowerCase().startsWith('fr') ? ',' : '.';
  const text = eurPerLiter.toFixed(3).replace('.', sep);
  return `${text} €/L`;
}

// -----------------------------------------------------------------
// Consumption
// -----------------------------------------------------------------

/**
 * Convert L/100 km to MPG (US).
 *   mpg = 235.214583 / (L/100km)
 */
export function lPer100kmToMpg(lPer100km: number): number {
  if (!Number.isFinite(lPer100km) || lPer100km <= 0) return 0;
  return 235.214583 / lPer100km;
}

export function mpgToLPer100km(mpg: number): number {
  if (!Number.isFinite(mpg) || mpg <= 0) return 0;
  return 235.214583 / mpg;
}

export function formatConsumptionLocalized(lPer100km: number, locale: string): string {
  if (!Number.isFinite(lPer100km) || lPer100km <= 0) return '—';
  if (unitSystemForLocale(locale) === 'imperial') {
    return `${lPer100kmToMpg(lPer100km).toFixed(1)} mpg`;
  }
  return `${lPer100km.toFixed(1)} L/100km`;
}
