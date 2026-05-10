// ============================================================
// Fuelyn Core — Public API
// ============================================================

// Domain types
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
} from './domain';

export { FUEL_TYPE_LABELS, DRIVE_TYPE_LABELS } from './domain';

// Energy Type Taxonomy
export type {
  EnergyType,
  EnergyCategory,
  StationType,
  ConnectorType,
  ChargingSpeed,
} from './domain';

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
} from './domain';

// Unified Station Model
export type {
  StationAddress,
  StationBase,
  UnifiedFuelStation,
  UnifiedChargingConnection,
  UnifiedChargingStation,
  UnifiedHydrogenStation,
  UnifiedGasStation,
  UnifiedStation,
} from './domain';

export {
  isFuelStation,
  isChargingStation,
  isHydrogenStation,
  isGasStation,
  getUnifiedPrice,
  getDisplayPrice,
  getLowestFuelPrice,
  formatStationAddress,
} from './domain';

// Unified Filter
export type { UnifiedFilter, UnifiedSortMode } from './domain';

export {
  DEFAULT_UNIFIED_FILTER,
  applyUnifiedFilter,
  matchesFilter,
  sortUnifiedStations,
  countActiveFilters,
} from './domain';

// Validation
export {
  apiListResponseSchema,
  apiPricesResponseSchema,
  apiDetailResponseSchema,
  vehicleProfileSchema,
  favoriteStationSchema,
  appSettingsSchema,
  stationFilterSchema,
  coordinateSchema,
  fuelTypeSchema,
  mapApiStation,
  mapApiStationDetail,
} from './validation/schemas';

// Services
export {
  ApiClient,
  ApiError,
  NetworkError,
  TimeoutError,
  ValidationError,
  RateLimitError,
  StationService,
  fetchRoute,
} from './services';
export type { ApiClientConfig, StationServiceConfig, PriceUpdate, RouteData, RouteStep, RouteManeuver, ManeuverType } from './services';

// Adapters
export type { DataSourceAdapter, SearchArea, AdapterSearchResult } from './services';
export {
  mapStationToUnified,
  mapStationsToUnified,
  normalizeConnectorType,
  mapChargingToUnified,
  mapChargingStationsToUnified,
  searchH2Stations,
  getAllH2Stations,
  searchGasStations,
  getAllGasStations,
} from './services';

// Engine
export {
  computeRecommendations,
  computeRemainingRange,
  computeReachability,
  estimateFuelCost,
  estimateDriveTime,
  filterReachableStations,
  analyzePrices,
  fallbackRecommendation,
  getMockRecommendation,
  PRICE_INTELLIGENCE_DEFAULTS,
} from './engine';
export type {
  ScoreWeights,
  RecommendationOptions,
  PriceRecommendation,
  PriceDataInput,
  Confidence,
  Action,
} from './engine';

// Year-in-Review
export {
  computeWrapped,
  DEFAULT_WRAPPED_CONFIG,
} from './wrapped';
export type {
  WrappedReport,
  WrappedInput,
  WrappedConfig,
  WrappedHighlight,
  WrappedPriceSnapshot,
  BrandTally,
  DayOfWeekTally,
} from './wrapped';

// Geo helpers + Fence engine
export {
  haversineKm,
  equirectangularKm,
  isInsideCircle,
  boundingBoxKm,
  EARTH_RADIUS_KM,
  evaluateFences,
  isGeoFence,
} from './geo';
export type {
  LatLng,
  BoundingBox,
  GeoFence,
  StationPriceSnapshot,
  FenceEngineState,
  FenceEvent,
  EvaluationResult,
  EvaluateOptions,
} from './geo';

// Storage
export {
  TypedStorage,
  WebStorageAdapter,
  createTypedStorage,
} from './storage/storage';
export type { StorageAdapter } from './storage/storage';

// i18n
export { de, en, enUS, fr, getTranslations } from './i18n';
export type { TranslationKeys } from './i18n';

// Utils
export {
  haversineDistance,
  isWithinGermany,
  formatCoordinates,
  formatPrice,
  splitPrice,
  formatDistance,
  formatDriveTime,
  formatCurrency,
  formatConsumption,
  formatRange,
  formatAddress,
} from './utils';

// Config
export {
  API_BASE_URL,
  API_ENDPOINTS,
  API_TIMEOUT_MS,
  API_RETRY_COUNT,
  RADIUS_OPTIONS_KM,
  DEFAULT_RADIUS_KM,
  FUEL_TYPES,
  STALE_TIME_LIST_MS,
  STALE_TIME_PRICES_MS,
  REFETCH_INTERVAL_PRICES_MS,
  SEARCH_DEBOUNCE_MS,
  RANGE_SAFETY_RESERVE_KM,
  SCORE_WEIGHTS,
  DEFAULT_SETTINGS,
  DEFAULT_FILTER,
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  MAP_STATION_ZOOM,
  STORAGE_KEYS,
  KNOWN_BRANDS,
  KNOWN_CHARGING_OPERATORS,
  KNOWN_H2_OPERATORS,
  AVERAGE_SPEED_KMH,
} from './config/constants';

// Bank CSV importer (German retail banks → fuel-log candidates)
export type {
  BankImportRow,
  BankImportResult,
  BankImportOptions,
} from './banking/import-bank-csv';
export {
  parseBankCsv,
  splitCsvRow as splitBankCsvRow,
} from './banking/import-bank-csv';

// Spritmonitor.de CSV importer (consumed by web's settings page)
export type {
  SpritmonitorImportResult,
  SpritmonitorRow,
  ImportError as SpritmonitorImportError,
  ImportOptions as SpritmonitorImportOptions,
} from './spritmonitor/import';
export {
  parseSpritmonitorCsv,
  splitCsvRow as splitSpritmonitorCsvRow,
} from './spritmonitor/import';

// Trip cost calculator
export type { TripCostEstimate, TripCostInputs } from './engine/trip-cost';
export { estimateTripCost, haversineDistanceKm } from './engine/trip-cost';

// Wallet-pass (Apple / Google) builder
export type {
  WalletPassInputs,
  WalletPassResult,
  ApplePassJson,
  GooglePassJson,
} from './engine/wallet-pass';
export {
  buildWalletPass,
  buildAppleManifest,
  rgbCss as walletRgbCss,
} from './engine/wallet-pass';

// EV charging-session planner
export type {
  ChargingPlanInputs,
  ChargingPlanResult,
} from './engine/ev-charging-planner';
export { planChargingSession } from './engine/ev-charging-planner';

// Multi-stop route optimisation (TSP)
export type {
  OptimizeStopsInputs,
  OptimizeStopsResult,
} from './engine/multi-stop';
export { optimizeStops } from './engine/multi-stop';

// Anonymous price-report validator
export type {
  PriceReportInput,
  PriceReportValidation,
  ReportClassification,
} from './engine/price-report';
export {
  validatePriceReport,
  MIN_PLAUSIBLE_PRICE,
  MAX_PLAUSIBLE_PRICE,
} from './engine/price-report';

// Border-crossing fuel-cost estimator
export type {
  BorderCountry,
  BorderHint,
  BorderHintInputs,
  BorderHintResult,
} from './engine/border-crossing';
export {
  evaluateBorderHints,
  BORDER_WAYPOINTS,
} from './engine/border-crossing';

// Brand membership / loyalty cards
export type { MembershipDiscount, MembershipId } from './engine/membership-tiers';
export {
  MEMBERSHIPS,
  applyMembership,
  findMembershipForBrand,
  getMembershipById,
} from './engine/membership-tiers';

// Counterfactual scenarios
export type {
  CounterfactualResult,
  CounterfactualInputs,
  ScenarioResult,
  ScenarioId,
} from './engine/counterfactual';
export { computeCounterfactuals, SCENARIO_PARAMS } from './engine/counterfactual';

// Personalized saving tips
export type {
  SavingTip,
  SavingTipsResult,
  SavingTipsInputs,
  TipSeverity,
} from './engine/saving-tips';
export { computeSavingTips } from './engine/saving-tips';

// Achievements
export type {
  Achievement,
  AchievementsResult,
  AchievementCategory,
} from './engine/achievements';
export { computeAchievements } from './engine/achievements';

// Smart-Buying Score
export type {
  SmartBuyingScore,
  SmartBuyingComponents,
  SmartBuyingInputs,
} from './engine/smart-buying-score';
export { computeSmartBuyingScore } from './engine/smart-buying-score';

// Best-time heatmap
export type { BestTimeHeatmap, HeatmapCell } from './engine/best-time-heatmap';
export { buildBestTimeHeatmap } from './engine/best-time-heatmap';

// CO₂ tracking
export type { Co2Summary, MonthlyCo2Bucket } from './engine/co2-tracking';
export {
  summarizeCo2,
  entryCo2Kg,
  CO2_FACTOR_KG_PER_LITER,
} from './engine/co2-tracking';

// Lightweight 24h price prediction
export type {
  PricePrediction,
  PredictedHour,
  PriceSnapshot as PredictionPriceSnapshot,
  PredictPricesOptions,
} from './engine/price-prediction';
export { predictNext24h } from './engine/price-prediction';

// Voice command intent parser (consumed by useVoiceCommand hook)
export type {
  VoiceIntent,
  VoiceIntentName,
  VoiceIntentSlots,
  ParseIntentOptions,
} from './voice/parse-intent';
export { parseVoiceIntent } from './voice/parse-intent';

// Receipt OCR parser (consumed by web's fuel-log scanner)
export type { ParsedReceipt } from './receipt/parse-receipt';
export {
  parseReceipt,
  extractDate as extractReceiptDate,
  extractBrand as extractReceiptBrand,
  extractFuelType as extractReceiptFuelType,
  extractLiters as extractReceiptLiters,
  extractPricePerLiter as extractReceiptPricePerLiter,
  extractTotal as extractReceiptTotal,
} from './receipt/parse-receipt';

// Pump-display OCR parser (consumed by web's price-report photo flow)
export type { ParsedPumpDisplay } from './receipt/parse-pump-display';
export {
  parsePumpDisplay,
  extractPumpPrice,
  extractPumpFuelType,
} from './receipt/parse-pump-display';
