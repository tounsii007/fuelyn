// ============================================================
// Fuelyn — Energy Type Taxonomy
// Comprehensive type system for all fuel types, charging types,
// connector types, and station categories in Germany.
// ============================================================

// ─── Energy Type ────────────────────────────────────────────

/**
 * All energy/fuel types the app can display and filter by.
 * Grouped: classic fuels | gas | hydrogen | electric charging.
 */
export type EnergyType =
  | 'diesel'
  | 'e5'
  | 'e10'
  | 'super_plus'
  | 'lpg'
  | 'cng'
  | 'lng'
  | 'h2'
  | 'ev_ac'
  | 'ev_dc'
  | 'ev_hpc';

export const ENERGY_TYPES: readonly EnergyType[] = [
  'diesel', 'e5', 'e10', 'super_plus',
  'lpg', 'cng', 'lng',
  'h2',
  'ev_ac', 'ev_dc', 'ev_hpc',
] as const;

export const ENERGY_TYPE_LABELS: Record<EnergyType, string> = {
  diesel: 'Diesel',
  e5: 'Super E5',
  e10: 'Super E10',
  super_plus: 'Super Plus',
  lpg: 'LPG / Autogas',
  cng: 'CNG / Erdgas',
  lng: 'LNG',
  h2: 'Wasserstoff',
  ev_ac: 'AC-Laden',
  ev_dc: 'DC-Schnellladen',
  ev_hpc: 'HPC (>150 kW)',
} as const;

export const ENERGY_TYPE_ICONS: Record<EnergyType, string> = {
  diesel: '⛽',
  e5: '⛽',
  e10: '⛽',
  super_plus: '⛽',
  lpg: '🔥',
  cng: '🔥',
  lng: '🔥',
  h2: '💧',
  ev_ac: '🔌',
  ev_dc: '⚡',
  ev_hpc: '⚡⚡',
} as const;

/** Short suffixes for price display. */
export const ENERGY_TYPE_UNITS: Record<EnergyType, string> = {
  diesel: '€/L',
  e5: '€/L',
  e10: '€/L',
  super_plus: '€/L',
  lpg: '€/L',
  cng: '€/kg',
  lng: '€/kg',
  h2: '€/kg',
  ev_ac: '€/kWh',
  ev_dc: '€/kWh',
  ev_hpc: '€/kWh',
} as const;

/** Grouping for the filter UI. */
export type EnergyCategory = 'fuel' | 'gas' | 'hydrogen' | 'electric';

export const ENERGY_CATEGORY_LABELS: Record<EnergyCategory, string> = {
  fuel: 'Kraftstoff',
  gas: 'Gas',
  hydrogen: 'Wasserstoff',
  electric: 'Elektro',
} as const;

export function getEnergyCategory(type: EnergyType): EnergyCategory {
  switch (type) {
    case 'diesel':
    case 'e5':
    case 'e10':
    case 'super_plus':
      return 'fuel';
    case 'lpg':
    case 'cng':
    case 'lng':
      return 'gas';
    case 'h2':
      return 'hydrogen';
    case 'ev_ac':
    case 'ev_dc':
    case 'ev_hpc':
      return 'electric';
  }
}

export function getEnergyTypesByCategory(category: EnergyCategory): EnergyType[] {
  return ENERGY_TYPES.filter((t) => getEnergyCategory(t) === category);
}

/** Check whether an energy type maps to a Tankerkoenig fuel type. */
export function isTankerkoenigFuelType(type: EnergyType): type is 'diesel' | 'e5' | 'e10' {
  return type === 'diesel' || type === 'e5' || type === 'e10';
}

/** Check whether an energy type is EV charging. */
export function isElectricType(type: EnergyType): boolean {
  return type === 'ev_ac' || type === 'ev_dc' || type === 'ev_hpc';
}

// ─── Station Type ───────────────────────────────────────────

/** High-level station category. */
export type StationType = 'fuel' | 'charging' | 'hydrogen' | 'gas';

export const STATION_TYPE_LABELS: Record<StationType, string> = {
  fuel: 'Tankstelle',
  charging: 'Ladestation',
  hydrogen: 'Wasserstoff-Tankstelle',
  gas: 'Gastankstelle',
} as const;

export const STATION_TYPE_ICONS: Record<StationType, string> = {
  fuel: '⛽',
  charging: '🔌',
  hydrogen: '💧',
  gas: '🔥',
} as const;

export const STATION_TYPES: readonly StationType[] = ['fuel', 'charging', 'hydrogen', 'gas'] as const;

// ─── Connector Type (EV) ────────────────────────────────────

/**
 * Standardized EV connector types used in Germany.
 */
export type ConnectorType =
  | 'type2'
  | 'ccs'
  | 'chademo'
  | 'schuko'
  | 'type1'
  | 'tesla_supercharger'
  | 'other';

export const CONNECTOR_TYPES: readonly ConnectorType[] = [
  'type2', 'ccs', 'chademo', 'schuko', 'type1', 'tesla_supercharger', 'other',
] as const;

export const CONNECTOR_TYPE_LABELS: Record<ConnectorType, string> = {
  type2: 'Typ 2',
  ccs: 'CCS (Combo 2)',
  chademo: 'CHAdeMO',
  schuko: 'Schuko',
  type1: 'Typ 1',
  tesla_supercharger: 'Tesla Supercharger',
  other: 'Sonstiger',
} as const;

export const CONNECTOR_TYPE_ICONS: Record<ConnectorType, string> = {
  type2: '🔌',
  ccs: '⚡',
  chademo: '⚡',
  schuko: '🔌',
  type1: '🔌',
  tesla_supercharger: '⚡',
  other: '🔌',
} as const;

// ─── Charging Speed Classification ──────────────────────────

export type ChargingSpeed = 'ac' | 'dc' | 'hpc';

export const CHARGING_SPEED_LABELS: Record<ChargingSpeed, string> = {
  ac: 'AC (bis 22 kW)',
  dc: 'DC (bis 150 kW)',
  hpc: 'HPC (ab 150 kW)',
} as const;

/** Classify charging power into speed tier. */
export function classifyChargingSpeed(powerKW: number | null): ChargingSpeed {
  if (powerKW == null || powerKW <= 22) return 'ac';
  if (powerKW <= 150) return 'dc';
  return 'hpc';
}

/** Power thresholds for AC/DC/HPC classification. */
export const CHARGING_POWER_THRESHOLDS = {
  AC_MAX: 22,
  DC_MAX: 150,
  HPC_MIN: 150,
} as const;
