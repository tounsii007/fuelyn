// ============================================================
// Fuelyn — Domain Types
// Central type definitions for the entire application.
// ============================================================

// ─── Fuel ────────────────────────────────────────────────────

/** Supported fuel types in Germany (Tankerkönig API keys). */
export type FuelType = 'diesel' | 'e5' | 'e10';

/** Human-readable labels per fuel type. */
export const FUEL_TYPE_LABELS: Record<FuelType, string> = {
  diesel: 'Diesel',
  e5: 'Super E5',
  e10: 'Super E10',
} as const;

// ─── Geo ─────────────────────────────────────────────────────

export interface Coordinates {
  readonly lat: number;
  readonly lng: number;
}

// ─── Opening Times ───────────────────────────────────────────

export interface OpeningTime {
  readonly text: string;
  readonly start: string; // "HH:mm"
  readonly end: string;   // "HH:mm"
}

// ─── Station ─────────────────────────────────────────────────

/** Aggregated fuel prices for a single station. */
export interface StationPrices {
  readonly diesel: number | null;
  readonly e5: number | null;
  readonly e10: number | null;
}

/** Operating status returned by the prices endpoint. */
export type StationStatus = 'open' | 'closed' | 'no prices' | 'not found';

/** Core station entity used throughout the app. */
export interface Station {
  readonly id: string;
  readonly name: string;
  readonly brand: string;
  readonly street: string;
  readonly houseNumber: string;
  readonly postCode: string;
  readonly place: string;
  readonly lat: number;
  readonly lng: number;
  /** Distance from search center in km. */
  readonly dist: number;
  readonly prices: StationPrices;
  readonly isOpen: boolean;
}

/** Extended station with detail-only fields. */
export interface StationDetail extends Station {
  readonly openingTimes: readonly OpeningTime[];
  readonly overrides: readonly string[];
  readonly wholeDay: boolean;
}

// ─── Vehicle Profile ─────────────────────────────────────────

export type FuelLevelUnit = 'percentage' | 'liters' | 'km';

/** Drive type determines which POI data to show (fuel stations, chargers, or both). */
export type DriveType = 'benzin' | 'diesel' | 'hybrid' | 'elektro' | 'gas' | 'h2';

export const DRIVE_TYPE_LABELS: Record<DriveType, string> = {
  benzin: 'Benzin',
  diesel: 'Diesel',
  hybrid: 'Hybrid',
  elektro: 'Elektro',
  gas: 'Gas (LPG/CNG)',
  h2: 'Wasserstoff',
} as const;

export interface VehicleProfile {
  readonly id: string;
  readonly name: string;
  readonly fuelType: FuelType;
  /** Drive type: benzin, diesel, hybrid, elektro, gas, or h2. */
  readonly driveType: DriveType;
  /** Average fuel consumption in L/100 km (or kWh/100km for electric, kg/100km for H2). */
  readonly consumption: number;
  /** Tank capacity in liters (optional, 0 for pure electric). */
  readonly tankCapacity: number | null;
  /** Battery capacity in kWh (for hybrid/electric, optional). */
  readonly batteryCapacity: number | null;
  /** Current remaining range in km (derived or entered). */
  readonly currentRange: number | null;
  /** Raw fuel-level value as entered by user. */
  readonly currentFuelLevel: number | null;
  /** Unit of the fuel-level value. */
  readonly currentFuelUnit: FuelLevelUnit;

  // ─── Extended EV/H2/Gas fields (optional, backward-compatible) ──

  /** Supported EV connector types (for EV/hybrid). */
  readonly connectorTypes?: readonly import('./energy-types').ConnectorType[];
  /** Maximum supported charging power in kW (for EV/hybrid). */
  readonly maxChargingPowerKW?: number | null;
  /** Whether the vehicle supports hydrogen fuel. */
  readonly h2Compatible?: boolean;
  /** Preferred gas type for gas-powered vehicles. */
  readonly preferredGasType?: 'lpg' | 'cng' | 'lng' | null;
}

// ─── Charging Station (E-Ladesäule) ─────────────────────────

export interface ChargingStation {
  readonly id: string;
  readonly name: string;
  readonly operator: string;
  readonly lat: number;
  readonly lng: number;
  readonly dist: number;
  readonly address: string;
  readonly city: string;
  readonly postCode: string;
  readonly connections: readonly ChargingConnection[];
  readonly isOperational: boolean;
  readonly usageCost: string | null;
  readonly accessType: string | null;
}

export interface ChargingConnection {
  readonly type: string;
  readonly powerKW: number | null;
  readonly quantity: number;
}

// ─── Affiliate / Tankkarten Partner ─────────────────────────

export interface AffiliatePartner {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: 'tankkarte' | 'ladekarte' | 'versicherung' | 'club';
  readonly logoUrl: string;
  readonly affiliateUrl: string;
  readonly benefits: readonly string[];
  readonly discount: string | null;
}

// ─── Reachability ────────────────────────────────────────────

export type ReachabilityStatus = 'safe' | 'tight' | 'unreachable';

// ─── Recommendation ──────────────────────────────────────────

export interface RecommendationScores {
  /** 0–1, higher = cheaper relative to range. */
  readonly price: number;
  /** 0–1, higher = closer. */
  readonly distance: number;
  /** 0–1, higher = more safely reachable. */
  readonly reachability: number;
  /** 0–1, 1 if open, 0 if closed. */
  readonly openStatus: number;
  /** 0–1, bonus for user favorites. */
  readonly favorite: number;
  /** Weighted aggregate 0–1. */
  readonly overall: number;
}

export interface StationRecommendation {
  readonly station: Station;
  readonly scores: RecommendationScores;
  readonly reachabilityStatus: ReachabilityStatus;
  /** Estimated extra fuel cost (EUR) to drive to this station. */
  readonly estimatedFuelCost: number;
  /** Estimated drive time in minutes (rough). */
  readonly estimatedDriveTime: number;
  /** 1-based rank within result set. */
  readonly rank: number;
  readonly isBestOption: boolean;
  /** Human-readable reasons why this station was recommended. */
  readonly reasons: string[];
}

// ─── Sort & Filter ───────────────────────────────────────────

export type SortMode = 'cheapest' | 'nearest' | 'recommended' | 'open';

export interface StationFilter {
  readonly fuelType: FuelType;
  readonly radiusKm: number;
  readonly onlyOpen: boolean;
  readonly brands: readonly string[];
  readonly priceMin: number | null;
  readonly priceMax: number | null;
}

// ─── Search ──────────────────────────────────────────────────

export interface SearchParams {
  readonly coordinates: Coordinates;
  readonly radiusKm: number;
  readonly fuelType: FuelType;
  readonly sort: 'price' | 'dist';
}

// ─── Favorites ───────────────────────────────────────────────

export interface FavoriteStation {
  readonly stationId: string;
  readonly name: string;
  readonly brand: string;
  readonly addedAt: string; // ISO 8601
}

// ─── App Settings ────────────────────────────────────────────

export type ThemeMode = 'light' | 'dark' | 'system';
export type AppLocale = 'de' | 'en' | 'en-US' | 'fr';
export type MapStyle = 'standard' | 'dark' | 'satellite' | 'terrain';
export type BackgroundVariant = 'aurora' | 'sunset' | 'ocean' | 'forest' | 'cyber' | 'minimal';

export interface AppSettings {
  readonly theme: ThemeMode;
  readonly locale: AppLocale;
  readonly defaultRadiusKm: number;
  readonly defaultFuelType: FuelType;
  readonly mapStyle: MapStyle;
  readonly background: BackgroundVariant;
}

// ─── Price History (prepared for future) ─────────────────────

export interface PriceSnapshot {
  readonly stationId: string;
  readonly fuelType: FuelType;
  readonly price: number;
  readonly timestamp: string; // ISO 8601
}

export interface PriceHistory {
  readonly stationId: string;
  readonly fuelType: FuelType;
  readonly snapshots: readonly PriceSnapshot[];
}

// ─── Price Alerts ───────────────────────────────────────────

export interface PriceAlert {
  readonly id: string;
  readonly fuelType: FuelType;
  readonly targetPrice: number;
  readonly enabled: boolean;
  readonly createdAt: string; // ISO 8601
  readonly lastTriggered?: string; // ISO 8601
}

// ─── Fuel Log ───────────────────────────────────────────────

export interface FuelLogEntry {
  readonly id: string;
  readonly date: string; // ISO 8601
  readonly stationName: string;
  readonly stationBrand: string;
  readonly fuelType: FuelType;
  readonly liters: number;
  readonly pricePerLiter: number;
  readonly totalCost: number;
  readonly odometer?: number;
  readonly note?: string;
}

// ─── Saved Locations ────────────────────────────────────────

export interface SavedLocation {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly icon: 'home' | 'work' | 'star' | 'pin';
}

// ─── API Error ───────────────────────────────────────────────

export interface ApiErrorInfo {
  readonly code: string;
  readonly message: string;
  readonly status?: number;
  readonly retryable: boolean;
}
