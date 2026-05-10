// ============================================================
// Fuelyn — Data Source Adapters
// ============================================================

export type { DataSourceAdapter, SearchArea, AdapterSearchResult } from './adapter-types';

// Tankerkoenig (fuel stations)
export { mapStationToUnified, mapStationsToUnified } from './tankerkoenig-adapter';

// OpenChargeMap (EV charging)
export {
  normalizeConnectorType,
  mapChargingToUnified,
  mapChargingStationsToUnified,
} from './openchargemap-adapter';

// Hydrogen (H2)
export { searchH2Stations, getAllH2Stations } from './h2-adapter';

// Gas (LPG / CNG / LNG)
export { searchGasStations, getAllGasStations } from './gas-adapter';

// Multi-country fuel-station adapters (Iter Z)
export { SpritpreisrechnerAdapter } from './spritpreisrechner-adapter';
export type { SpritpreisrechnerAdapterConfig } from './spritpreisrechner-adapter';
export { PrixCarburantsAdapter } from './prix-carburants-adapter';
export type { PrixCarburantsAdapterConfig } from './prix-carburants-adapter';
export {
  OsservaPrezziAdapter,
  parseMimitCsv,
} from './osservaprezzi-adapter';
export type {
  OsservaPrezziAdapterConfig,
  OsservaPrezziDataLoader,
  ItStationRow,
} from './osservaprezzi-adapter';
