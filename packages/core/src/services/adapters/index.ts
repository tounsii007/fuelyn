// ============================================================
// TankPilot — Data Source Adapters
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
