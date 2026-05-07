// ============================================================
// TankPilot — Data Source Adapter Interface
// Abstract contract for all station data providers.
// ============================================================

import type { UnifiedStation } from '../../domain/unified-station';
import type { StationType } from '../../domain/energy-types';

/** Geographic search area. */
export interface SearchArea {
  readonly lat: number;
  readonly lng: number;
  readonly radiusKm: number;
}

/** Result from an adapter search. */
export interface AdapterSearchResult<T extends UnifiedStation = UnifiedStation> {
  readonly stations: T[];
  /** The data source name. */
  readonly source: string;
  /** Whether the result was from cache. */
  readonly fromCache?: boolean;
  /** Error message if the adapter partially failed. */
  readonly error?: string;
}

/**
 * Contract for data source adapters.
 * Each adapter normalizes a specific API's response into
 * the UnifiedStation format.
 */
export interface DataSourceAdapter<T extends UnifiedStation = UnifiedStation> {
  /** Unique source identifier. */
  readonly sourceId: string;
  /** Which station type this adapter provides. */
  readonly stationType: StationType;
  /** Search for stations in the given area. */
  search(area: SearchArea, signal?: AbortSignal): Promise<AdapterSearchResult<T>>;
}
