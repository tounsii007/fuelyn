// ─── Core Domain Types ──────────────────────────────────────
export type {
  FuelType,
  Coordinates,
  OpeningTime,
  StationPrices,
  StationStatus,
  Station,
  StationDetail,
  FuelLevelUnit,
  DriveType,
  VehicleProfile,
  ChargingStation,
  ChargingConnection,
  AffiliatePartner,
  ReachabilityStatus,
  RecommendationScores,
  StationRecommendation,
  SortMode,
  StationFilter,
  SearchParams,
  FavoriteStation,
  ThemeMode,
  AppLocale,
  MapStyle,
  BackgroundVariant,
  AppSettings,
  PriceSnapshot,
  PriceHistory,
  PriceAlert,
  FuelLogEntry,
  SavedLocation,
  ApiErrorInfo,
} from './types';

export { FUEL_TYPE_LABELS, DRIVE_TYPE_LABELS } from './types';

// ─── Energy Type Taxonomy ───────────────────────────────────
export type {
  EnergyType,
  EnergyCategory,
  StationType,
  ConnectorType,
  ChargingSpeed,
} from './energy-types';

export {
  ENERGY_TYPES,
  ENERGY_TYPE_LABELS,
  ENERGY_TYPE_ICONS,
  ENERGY_TYPE_UNITS,
  ENERGY_CATEGORY_LABELS,
  STATION_TYPES,
  STATION_TYPE_LABELS,
  STATION_TYPE_ICONS,
  CONNECTOR_TYPES,
  CONNECTOR_TYPE_LABELS,
  CONNECTOR_TYPE_ICONS,
  CHARGING_SPEED_LABELS,
  CHARGING_POWER_THRESHOLDS,
  getEnergyCategory,
  getEnergyTypesByCategory,
  isTankerkoenigFuelType,
  isElectricType,
  classifyChargingSpeed,
} from './energy-types';

// ─── Unified Station Model ─────────────────────────────────
export type {
  StationAddress,
  StationBase,
  UnifiedFuelStation,
  UnifiedChargingConnection,
  UnifiedChargingStation,
  UnifiedHydrogenStation,
  UnifiedGasStation,
  UnifiedStation,
} from './unified-station';

export {
  isFuelStation,
  isChargingStation,
  isHydrogenStation,
  isGasStation,
  getUnifiedPrice,
  getDisplayPrice,
  getLowestFuelPrice,
  formatStationAddress,
} from './unified-station';

// ─── Unified Filter ─────────────────────────────────────────
export type { UnifiedFilter, UnifiedSortMode } from './unified-filter';

export {
  DEFAULT_UNIFIED_FILTER,
  applyUnifiedFilter,
  matchesFilter,
  sortUnifiedStations,
  countActiveFilters,
} from './unified-filter';
