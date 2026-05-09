// ============================================================
// Marker Icon Cache — Avoids creating duplicate Leaflet DivIcon
// instances for identical marker configurations.
// ============================================================

import L from 'leaflet';

/**
 * In-memory cache for Leaflet DivIcon instances, keyed by a
 * composite string derived from all visual parameters.
 *
 * Without caching, every render cycle creates a brand-new DivIcon
 * per station, which means hundreds of identical DOM-template
 * objects living in memory. This cache ensures each unique
 * visual combination is allocated only once.
 */
const iconCache = new Map<string, L.DivIcon>();

/** Build a deterministic cache key from the marker parameters. */
function buildKey(
  type: string,
  ...parts: (string | number | boolean | null | undefined)[]
): string {
  return `${type}:${parts.map((p) => String(p ?? '')).join('|')}`;
}

/**
 * Retrieve a cached DivIcon or create one via `factory`, store it
 * in the cache, and return it. Subsequent calls with the same key
 * return the cached instance.
 */
export function getCachedIcon(
  key: string,
  factory: () => L.DivIcon,
): L.DivIcon {
  const cached = iconCache.get(key);
  if (cached) return cached;

  const icon = factory();
  iconCache.set(key, icon);
  return icon;
}

/**
 * Build a cache key for price marker icons.
 * Encodes every visual-differentiating parameter.
 *
 * `mapStyle` is included because each tile style (light Voyager,
 * Dark, Satellite, Terrain) gets its own marker palette so the
 * card stays legible against the background. Two markers that are
 * identical in everything else but rendered on different basemaps
 * must NOT share a DivIcon — otherwise switching map styles would
 * leave stale markers around.
 */
export function priceMarkerKey(
  price: number | null,
  isBest: boolean,
  isOpen: boolean,
  reachability: 'safe' | 'tight' | 'unreachable',
  brand: string,
  mapStyle: string,
): string {
  return buildKey('price', price, isBest, isOpen, reachability, brand, mapStyle);
}

/**
 * Build a cache key for charging station marker icons.
 */
export function chargingMarkerKey(
  isOperational: boolean,
  maxPowerKW: number | null,
): string {
  return buildKey('charging', isOperational, maxPowerKW);
}

/**
 * Build a cache key for hydrogen station marker icons.
 */
export function h2MarkerKey(
  isAvailable: boolean,
  pricePerKg: number | null,
): string {
  return buildKey('h2', isAvailable, pricePerKg);
}

/**
 * Build a cache key for gas station (LPG/CNG/LNG) marker icons.
 */
export function gasMarkerKey(
  isOpen: boolean,
  gasTypes: string,
  lowestPrice: number | null,
): string {
  return buildKey('gas', isOpen, gasTypes, lowestPrice);
}

/**
 * Build a cache key for cluster icons.
 */
export function clusterMarkerKey(childCount: number): string {
  return buildKey('cluster', childCount);
}

/**
 * Clear the entire icon cache. Useful when theme changes or
 * during hot-module-replacement in development.
 */
export function clearIconCache(): void {
  iconCache.clear();
}

/** Current cache size (useful for debugging / metrics). */
export function iconCacheSize(): number {
  return iconCache.size;
}
