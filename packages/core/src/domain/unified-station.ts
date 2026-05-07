// ============================================================
// TankPilot — Unified Station Model
// Discriminated union for all station types: fuel, charging,
// hydrogen, and gas stations. Enables unified filtering,
// sorting, and display across data sources.
// ============================================================

import type { EnergyType, StationType, ConnectorType, ChargingSpeed } from './energy-types';
import type { OpeningTime, StationPrices } from './types';

// ─── Common Address ─────────────────────────────────────────

export interface StationAddress {
  readonly street: string;
  readonly houseNumber: string;
  readonly postCode: string;
  readonly city: string;
  readonly state?: string;
}

// ─── Base Fields (shared by all station types) ──────────────

export interface StationBase {
  readonly id: string;
  readonly name: string;
  readonly brand: string;
  readonly lat: number;
  readonly lng: number;
  /** Distance from search center in km. */
  readonly dist: number;
  readonly address: StationAddress;
  readonly isOpen: boolean;
  readonly stationType: StationType;
  /** Which energy types this station offers. */
  readonly energyTypes: readonly EnergyType[];
  /** Data source identifier (e.g. 'tankerkoenig', 'openchargemap'). */
  readonly source: string;
  /** ISO 8601 timestamp of last data update. */
  readonly lastUpdated?: string;
}

// ─── Fuel Station (Tankerkoenig) ────────────────────────────

export interface UnifiedFuelStation extends StationBase {
  readonly stationType: 'fuel';
  /** Standard Tankerkoenig prices (diesel, e5, e10). */
  readonly prices: StationPrices;
  /** Extended prices for non-Tankerkoenig fuel types (super_plus, etc.). */
  readonly extraPrices?: Partial<Record<EnergyType, number | null>>;
  readonly openingTimes?: readonly OpeningTime[];
  readonly wholeDay?: boolean;
}

// ─── Charging Station (E-Ladesäule) ─────────────────────────

export interface UnifiedChargingConnection {
  readonly connectorType: ConnectorType;
  /** Human-readable connector label. */
  readonly connectorLabel: string;
  readonly powerKW: number | null;
  readonly quantity: number;
  readonly chargingSpeed: ChargingSpeed;
}

export interface UnifiedChargingStation extends StationBase {
  readonly stationType: 'charging';
  readonly connections: readonly UnifiedChargingConnection[];
  /** Operator / Betreiber. */
  readonly operator: string;
  /** Free-text cost information. */
  readonly usageCost: string | null;
  /** Access type (e.g. "öffentlich", "halböffentlich"). */
  readonly accessType: string | null;
  /** Charging speed tiers available. */
  readonly chargingTypes: readonly ChargingSpeed[];
  /** Maximum power across all connections (kW). */
  readonly maxPowerKW: number | null;
  /** Total number of charging points. */
  readonly totalPoints: number;
  readonly isOperational: boolean;
}

// ─── Hydrogen Station (H2-Tankstelle) ──────────────────────

export interface UnifiedHydrogenStation extends StationBase {
  readonly stationType: 'hydrogen';
  /** Price per kg of H2 in EUR. */
  readonly h2PricePerKg: number | null;
  /** Supported pressure levels (bar). */
  readonly h2Pressure: readonly (350 | 700)[];
  /** Whether the station currently has H2 available. */
  readonly h2Available: boolean;
  readonly operator: string;
}

// ─── Gas Station (LPG / CNG / LNG) ─────────────────────────

export interface UnifiedGasStation extends StationBase {
  readonly stationType: 'gas';
  /** Which gas types are offered. */
  readonly gasTypes: readonly ('lpg' | 'cng' | 'lng')[];
  /** Prices per gas type. */
  readonly gasPrices: Partial<Record<'lpg' | 'cng' | 'lng', number | null>>;
  readonly operator: string;
}

// ─── Discriminated Union ────────────────────────────────────

export type UnifiedStation =
  | UnifiedFuelStation
  | UnifiedChargingStation
  | UnifiedHydrogenStation
  | UnifiedGasStation;

// ─── Type Guards ────────────────────────────────────────────

export function isFuelStation(station: UnifiedStation): station is UnifiedFuelStation {
  return station.stationType === 'fuel';
}

export function isChargingStation(station: UnifiedStation): station is UnifiedChargingStation {
  return station.stationType === 'charging';
}

export function isHydrogenStation(station: UnifiedStation): station is UnifiedHydrogenStation {
  return station.stationType === 'hydrogen';
}

export function isGasStation(station: UnifiedStation): station is UnifiedGasStation {
  return station.stationType === 'gas';
}

// ─── Price Extraction ───────────────────────────────────────

/**
 * Extract a numeric price from any station type for a given energy type.
 * Returns null if the station doesn't offer that energy type or has no price data.
 */
export function getUnifiedPrice(station: UnifiedStation, energyType: EnergyType): number | null {
  switch (station.stationType) {
    case 'fuel': {
      // Check standard Tankerkoenig prices
      if (energyType === 'diesel' || energyType === 'e5' || energyType === 'e10') {
        return station.prices?.[energyType] ?? null;
      }
      // Check extended prices
      return station.extraPrices?.[energyType] ?? null;
    }
    case 'charging':
      // EV charging often has free-text cost, no standard numeric price
      return null;
    case 'hydrogen':
      return energyType === 'h2' ? station.h2PricePerKg : null;
    case 'gas': {
      if (energyType === 'lpg' || energyType === 'cng' || energyType === 'lng') {
        return station.gasPrices[energyType] ?? null;
      }
      return null;
    }
  }
}

/**
 * Get a displayable price string for any station type.
 * Returns null if no price data is available.
 */
export function getDisplayPrice(station: UnifiedStation, energyType: EnergyType): string | null {
  const price = getUnifiedPrice(station, energyType);
  if (price != null) return `${price.toFixed(2)} €`;

  // For charging stations, return free-text cost if available
  if (station.stationType === 'charging' && station.usageCost) {
    return station.usageCost;
  }

  return null;
}

// ─── Helpers ────────────────────────────────────────────────

/** Get the "best" (lowest) price from a fuel station for display. */
export function getLowestFuelPrice(station: UnifiedFuelStation): { type: EnergyType; price: number } | null {
  const candidates: { type: EnergyType; price: number }[] = [];

  if (!station.prices) return null;
  for (const [key, val] of Object.entries(station.prices) as [string, number | null][]) {
    if (val != null && (key === 'diesel' || key === 'e5' || key === 'e10')) {
      candidates.push({ type: key as EnergyType, price: val });
    }
  }

  if (station.extraPrices) {
    for (const [key, val] of Object.entries(station.extraPrices) as [string, number | null | undefined][]) {
      if (val != null) candidates.push({ type: key as EnergyType, price: val });
    }
  }

  if (candidates.length === 0) return null;
  return candidates.reduce((best, cur) => (cur.price < best.price ? cur : best));
}

/** Flatten a unified station's address into a single line. */
export function formatStationAddress(address: StationAddress): string {
  const street = address.houseNumber
    ? `${address.street} ${address.houseNumber}`
    : address.street;
  return `${street}, ${address.postCode} ${address.city}`;
}
