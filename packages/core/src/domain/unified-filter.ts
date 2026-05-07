// ============================================================
// Fuelyn — Unified Filter Model
// Extended filter for all station types, energy types,
// connector types, and charging power levels.
// ============================================================

import type { EnergyType, StationType, ConnectorType, ChargingSpeed } from './energy-types';
import { isElectricType } from './energy-types';
import type { UnifiedStation } from './unified-station';
import { getUnifiedPrice } from './unified-station';

// ─── Filter Shape ───────────────────────────────────────────

export interface UnifiedFilter {
  /** Search radius in km. */
  readonly radiusKm: number;
  /** Show only currently open stations. */
  readonly onlyOpen: boolean;
  /** Filter by brand / operator names (empty = all). */
  readonly brands: readonly string[];

  // ─── Energy & Station Type ──────────────────────
  /** Selected energy types to display. */
  readonly energyTypes: readonly EnergyType[];
  /** Station types to show (empty = all). */
  readonly stationTypes: readonly StationType[];

  // ─── Price ──────────────────────────────────────
  /** Minimum price filter (null = no min). */
  readonly priceMin: number | null;
  /** Maximum price filter (null = no max). */
  readonly priceMax: number | null;

  // ─── EV-specific ────────────────────────────────
  /** Required connector types (empty = all). */
  readonly connectorTypes: readonly ConnectorType[];
  /** Minimum charging power in kW (null = no min). */
  readonly minPowerKW: number | null;
  /** Required charging speed tiers (empty = all). */
  readonly chargingTypes: readonly ChargingSpeed[];

  // ─── Sorting ────────────────────────────────────
  /** Primary sort mode. */
  readonly sortMode: UnifiedSortMode;
}

export type UnifiedSortMode =
  | 'recommended'
  | 'cheapest'
  | 'nearest'
  | 'open'
  | 'fastest_charging'
  | 'highest_power';

// ─── Defaults ───────────────────────────────────────────────

export const DEFAULT_UNIFIED_FILTER: UnifiedFilter = {
  radiusKm: 5,
  onlyOpen: false,
  brands: [],
  energyTypes: ['diesel', 'e5', 'e10'],
  stationTypes: [],
  priceMin: null,
  priceMax: null,
  connectorTypes: [],
  minPowerKW: null,
  chargingTypes: [],
  sortMode: 'recommended',
} as const;

// ─── Filter Predicates ──────────────────────────────────────

/**
 * Apply the unified filter to a list of stations.
 * Returns a filtered subset.
 */
export function applyUnifiedFilter(
  stations: readonly UnifiedStation[],
  filter: UnifiedFilter,
): UnifiedStation[] {
  return stations.filter((station) => matchesFilter(station, filter));
}

/**
 * Check if a single station matches the filter criteria.
 */
export function matchesFilter(station: UnifiedStation, filter: UnifiedFilter): boolean {
  // Station type filter
  if (filter.stationTypes.length > 0 && !filter.stationTypes.includes(station.stationType)) {
    return false;
  }

  // Energy type filter — station must offer at least one of the selected types
  if (filter.energyTypes.length > 0) {
    const hasMatch = filter.energyTypes.some((et) => station.energyTypes.includes(et));
    if (!hasMatch) return false;
  }

  // Only open
  if (filter.onlyOpen && !station.isOpen) {
    return false;
  }

  // Brand filter
  if (filter.brands.length > 0) {
    const brand = station.brand.toLowerCase();
    const operator = station.stationType === 'charging' ? station.operator.toLowerCase() : '';
    const matchesBrand = filter.brands.some(
      (b) => brand.includes(b.toLowerCase()) || operator.includes(b.toLowerCase()),
    );
    if (!matchesBrand) return false;
  }

  // Price range filter (only applies to stations with numeric prices)
  if (filter.priceMin != null || filter.priceMax != null) {
    const relevantEnergyTypes = filter.energyTypes.length > 0
      ? filter.energyTypes.filter((et) => !isElectricType(et))
      : ['diesel', 'e5', 'e10'] as EnergyType[];

    const prices = relevantEnergyTypes
      .map((et) => getUnifiedPrice(station, et))
      .filter((p): p is number => p != null);

    if (prices.length > 0) {
      const minPrice = Math.min(...prices);
      if (filter.priceMin != null && minPrice < filter.priceMin) return false;
      if (filter.priceMax != null && minPrice > filter.priceMax) return false;
    }
  }

  // EV-specific filters
  if (station.stationType === 'charging') {
    // Connector type filter
    if (filter.connectorTypes.length > 0) {
      const hasConnector = station.connections.some(
        (c) => filter.connectorTypes.includes(c.connectorType),
      );
      if (!hasConnector) return false;
    }

    // Minimum power filter
    if (filter.minPowerKW != null) {
      const maxPower = station.maxPowerKW ?? 0;
      if (maxPower < filter.minPowerKW) return false;
    }

    // Charging speed filter
    if (filter.chargingTypes.length > 0) {
      const hasSpeed = station.chargingTypes.some(
        (ct) => filter.chargingTypes.includes(ct),
      );
      if (!hasSpeed) return false;
    }
  }

  return true;
}

// ─── Sort Helpers ───────────────────────────────────────────

/**
 * Sort unified stations by the given sort mode.
 * Returns a new sorted array.
 */
export function sortUnifiedStations(
  stations: readonly UnifiedStation[],
  sortMode: UnifiedSortMode,
  selectedEnergyTypes: readonly EnergyType[] = [],
): UnifiedStation[] {
  const sorted = [...stations];

  switch (sortMode) {
    case 'nearest':
      sorted.sort((a, b) => a.dist - b.dist);
      break;

    case 'cheapest': {
      // Sort by lowest price among selected fuel types
      const fuelTypes = selectedEnergyTypes.length > 0
        ? selectedEnergyTypes.filter((et) => !isElectricType(et))
        : ['e10'] as EnergyType[];
      sorted.sort((a, b) => {
        const pa = getLowestPrice(a, fuelTypes);
        const pb = getLowestPrice(b, fuelTypes);
        if (pa == null && pb == null) return a.dist - b.dist;
        if (pa == null) return 1;
        if (pb == null) return -1;
        return pa - pb;
      });
      break;
    }

    case 'open':
      sorted.sort((a, b) => {
        if (a.isOpen === b.isOpen) return a.dist - b.dist;
        return a.isOpen ? -1 : 1;
      });
      break;

    case 'fastest_charging':
      sorted.sort((a, b) => {
        const pa = a.stationType === 'charging' ? (a.maxPowerKW ?? 0) : 0;
        const pb = b.stationType === 'charging' ? (b.maxPowerKW ?? 0) : 0;
        return pb - pa;
      });
      break;

    case 'highest_power':
      sorted.sort((a, b) => {
        const pa = a.stationType === 'charging' ? (a.maxPowerKW ?? 0) : 0;
        const pb = b.stationType === 'charging' ? (b.maxPowerKW ?? 0) : 0;
        return pb - pa;
      });
      break;

    case 'recommended':
    default:
      // Keep original order (will be sorted by recommendation engine)
      break;
  }

  return sorted;
}

function getLowestPrice(station: UnifiedStation, energyTypes: readonly EnergyType[]): number | null {
  const prices = energyTypes
    .map((et) => getUnifiedPrice(station, et))
    .filter((p): p is number => p != null);
  return prices.length > 0 ? Math.min(...prices) : null;
}

// ─── Filter Counting ────────────────────────────────────────

/** Count how many filter options are actively set (non-default). */
export function countActiveFilters(filter: UnifiedFilter): number {
  let count = 0;
  if (filter.onlyOpen) count++;
  if (filter.brands.length > 0) count++;
  if (filter.priceMin != null) count++;
  if (filter.priceMax != null) count++;
  if (filter.connectorTypes.length > 0) count++;
  if (filter.minPowerKW != null) count++;
  if (filter.chargingTypes.length > 0) count++;
  if (filter.stationTypes.length > 0) count++;
  return count;
}
