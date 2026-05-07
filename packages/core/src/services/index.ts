export { ApiClient, ApiError, NetworkError, TimeoutError, ValidationError, RateLimitError } from './api-client';
export type { ApiClientConfig } from './api-client';

export { StationService } from './station-service';
export type { StationServiceConfig, PriceUpdate } from './station-service';

export { fetchRoute } from './route-service';
export type { RouteData, RouteStep, RouteManeuver, ManeuverType } from './route-service';

// Adapters
export type { DataSourceAdapter, SearchArea, AdapterSearchResult } from './adapters';
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
} from './adapters';
