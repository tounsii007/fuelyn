// ============================================================
// TankPilot - Station Service
// High-level service that orchestrates API calls, validates
// responses, and returns typed domain models.
// ============================================================

import type { FuelType, Station, StationDetail, StationPrices, StationStatus } from '../domain/types';
import { API_ENDPOINTS, MAX_PRICE_QUERY_IDS } from '../config/constants';
import { ApiClient, ValidationError } from './api-client';
import {
  apiDetailResponseSchema,
  apiListResponseSchema,
  apiPricesResponseSchema,
  mapApiStation,
  mapApiStationDetail,
} from '../validation/schemas';

// Service config

export interface StationServiceConfig {
  /** Pre-configured ApiClient (e.g., pointing to BFF or directly to Tankerkoenig). */
  client: ApiClient;
  /** API key - only needed when calling Tankerkoenig directly (not via BFF). */
  apiKey?: string;
}

// Price update result

export interface PriceUpdate {
  readonly stationId: string;
  readonly prices: StationPrices;
  readonly status: StationStatus;
}

// Service

export class StationService {
  private readonly client: ApiClient;
  private readonly apiKey: string | undefined;

  constructor(config: StationServiceConfig) {
    this.client = config.client;
    this.apiKey = config.apiKey;
  }

  /**
   * Search for stations within a radius around given coordinates.
   * Returns validated, mapped domain models.
   */
  async searchStations(params: {
    lat: number;
    lng: number;
    radiusKm: number;
    fuelType: FuelType;
    sort?: 'price' | 'dist';
    signal?: AbortSignal;
  }): Promise<Station[]> {
    const raw = await this.client.get<unknown>(
      API_ENDPOINTS.LIST,
      {
        lat: params.lat,
        lng: params.lng,
        rad: params.radiusKm,
        sort: params.sort ?? 'dist',
        type: params.fuelType,
        ...(this.apiKey ? { apikey: this.apiKey } : {}),
      },
      { signal: params.signal },
    );

    const parsed = apiListResponseSchema.safeParse(raw);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.message);
    }

    if (!parsed.data.ok) {
      throw new ValidationError('API returned ok=false for list endpoint');
    }

    return parsed.data.stations.map((s) => mapApiStation(s, params.fuelType));
  }

  /**
   * Fetch current prices for a batch of station IDs.
   * Automatically chunks into groups of MAX_PRICE_QUERY_IDS.
   */
  async fetchPrices(
    stationIds: string[],
    signal?: AbortSignal,
  ): Promise<PriceUpdate[]> {
    if (stationIds.length === 0) return [];

    const chunks = this.chunkArray(stationIds, MAX_PRICE_QUERY_IDS);
    const results: PriceUpdate[] = [];

    for (const chunk of chunks) {
      const raw = await this.client.get<unknown>(
        API_ENDPOINTS.PRICES,
        {
          ids: chunk.join(','),
          ...(this.apiKey ? { apikey: this.apiKey } : {}),
        },
        { signal },
      );

      const parsed = apiPricesResponseSchema.safeParse(raw);

      if (!parsed.success) {
        throw new ValidationError(parsed.error.message);
      }

      if (!parsed.data.ok) {
        throw new ValidationError('API returned ok=false for prices endpoint');
      }

      for (const [stationId, entry] of Object.entries(parsed.data.prices)) {
        results.push({
          stationId,
          prices: {
            diesel: entry.diesel ?? null,
            e5: entry.e5 ?? null,
            e10: entry.e10 ?? null,
          },
          status: entry.status,
        });
      }
    }

    return results;
  }

  /**
   * Fetch detailed information for a single station.
   */
  async fetchStationDetail(
    stationId: string,
    signal?: AbortSignal,
  ): Promise<StationDetail> {
    const raw = await this.client.get<unknown>(
      API_ENDPOINTS.DETAIL,
      {
        id: stationId,
        ...(this.apiKey ? { apikey: this.apiKey } : {}),
      },
      { signal },
    );

    const parsed = apiDetailResponseSchema.safeParse(raw);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.message);
    }

    if (!parsed.data.ok) {
      throw new ValidationError('API returned ok=false for detail endpoint');
    }

    return mapApiStationDetail(parsed.data.station);
  }

  /**
   * Merge price updates into an existing station list.
   * Returns a new array - does not mutate.
   */
  mergeUpdatedPrices(
    stations: readonly Station[],
    updates: readonly PriceUpdate[],
  ): Station[] {
    const priceMap = new Map(updates.map((u) => [u.stationId, u]));

    return stations.map((station) => {
      const update = priceMap.get(station.id);
      if (!update) return station;

      return {
        ...station,
        prices: update.prices,
        isOpen: update.status === 'open',
      };
    });
  }

  // Internal

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }
}
