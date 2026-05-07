// ============================================================
// Fuelyn — Application Constants
// ============================================================

import type { AppSettings, FuelType, StationFilter } from '../domain/types';

// ─── API ─────────────────────────────────────────────────────

export const API_BASE_URL = 'https://creativecommons.tankerkoenig.de' as const;

export const API_ENDPOINTS = {
  LIST: '/json/list.php',
  PRICES: '/json/prices.php',
  DETAIL: '/json/detail.php',
} as const;

/** Maximum stations that can be queried in a single prices request. */
export const MAX_PRICE_QUERY_IDS = 10;

export const API_TIMEOUT_MS = 10_000;
export const API_RETRY_COUNT = 2;
export const API_RETRY_DELAY_MS = 1_000;

// ─── Search ──────────────────────────────────────────────────

export const RADIUS_OPTIONS_KM = [2, 5, 10, 25] as const;
export type RadiusOption = (typeof RADIUS_OPTIONS_KM)[number];

export const DEFAULT_RADIUS_KM: RadiusOption = 5;

export const FUEL_TYPES: readonly FuelType[] = ['diesel', 'e5', 'e10'] as const;

// ─── Refresh / Caching ──────────────────────────────────────

/** How long list data stays fresh before background refetch (ms). */
export const STALE_TIME_LIST_MS = 60_000; // 1 min

/** How long price data stays fresh (ms). */
export const STALE_TIME_PRICES_MS = 30_000; // 30 s

/** Background refetch interval for prices (ms). */
export const REFETCH_INTERVAL_PRICES_MS = 60_000; // 1 min

/** Debounce delay for manual search input (ms). */
export const SEARCH_DEBOUNCE_MS = 400;

// ─── Range / Recommendation ─────────────────────────────────

/** Safety reserve in km — stations within this margin are "tight". */
export const RANGE_SAFETY_RESERVE_KM = 10;

/** Stations farther than remaining range minus buffer are unreachable. */
export const RANGE_UNREACHABLE_FACTOR = 0.95;

/** Average driving speed for ETA estimation (km/h). */
export const AVERAGE_SPEED_KMH = 50;

/** Score weights (must sum to 1.0). */
export const SCORE_WEIGHTS = {
  price: 0.35,
  distance: 0.25,
  reachability: 0.20,
  openStatus: 0.15,
  favorite: 0.05,
} as const satisfies Record<string, number>;

// ─── Defaults ────────────────────────────────────────────────

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  locale: 'de',
  defaultRadiusKm: DEFAULT_RADIUS_KM,
  defaultFuelType: 'e10',
  mapStyle: 'standard',
  background: 'aurora',
} as const;

export const DEFAULT_FILTER: StationFilter = {
  fuelType: 'e10',
  radiusKm: DEFAULT_RADIUS_KM,
  onlyOpen: false,
  brands: [],
  priceMin: null,
  priceMax: null,
} as const;

// ─── Map ─────────────────────────────────────────────────────

/** Default map center: geographic center of Germany. */
export const MAP_DEFAULT_CENTER = { lat: 51.1657, lng: 10.4515 } as const;
export const MAP_DEFAULT_ZOOM = 13;
export const MAP_STATION_ZOOM = 15;

// ─── Storage Keys ────────────────────────────────────────────

export const STORAGE_KEYS = {
  VEHICLE_PROFILES: 'fuelyn:vehicles',
  FAVORITES: 'fuelyn:favorites',
  SETTINGS: 'fuelyn:settings',
  LAST_SEARCH: 'fuelyn:lastSearch',
  ONBOARDING_DONE: 'fuelyn:onboardingDone',
  PRICE_ALERTS: 'fuelyn:priceAlerts',
  FUEL_LOG: 'fuelyn:fuelLog',
  PRICE_HISTORY: 'fuelyn:priceHistory',
  SAVED_LOCATIONS: 'fuelyn:savedLocations',
} as const;

// ─── Brands (common German fuel station brands) ──────────────

export const KNOWN_BRANDS = [
  'Aral',
  'Shell',
  'Esso',
  'Total',
  'TotalEnergies',
  'Jet',
  'Star',
  'Agip',
  'OMV',
  'Westfalen',
  'HEM',
  'Avia',
  'bft',
  'Raiffeisen',
  'Q1',
  'Globus',
  'Kaufland',
  'SB',
  'Supermarkt',
] as const;

// ─── EV Charging Operators ──────────────────────────────────

export const KNOWN_CHARGING_OPERATORS = [
  'EnBW',
  'Ionity',
  'Tesla',
  'Allego',
  'E.ON',
  'Vattenfall',
  'Fastned',
  'EWE Go',
  'Maingau',
  'Aral pulse',
  'Shell Recharge',
  'ADAC',
  'Lidl',
  'ALDI',
] as const;

// ─── H2 Operators ───────────────────────────────────────────

export const KNOWN_H2_OPERATORS = [
  'H2 MOBILITY',
  'Shell',
  'TotalEnergies',
  'Linde',
  'Air Liquide',
] as const;

// ─── Re-export Unified Filter Default ───────────────────────

export { DEFAULT_UNIFIED_FILTER } from '../domain/unified-filter';
