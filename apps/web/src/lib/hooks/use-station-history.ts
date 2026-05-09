// ============================================================
// useStationHistory — fetches per-station price history for
// sparklines + forecast chips. Lazy on purpose: the StationCard
// only triggers it when it scrolls into the visible viewport so
// a 14-station list doesn't fan out 14 simultaneous requests.
// ============================================================

'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '../http/fetch-json';

export interface PricePoint {
  readonly price: number;
  readonly timestamp: string;
}

export interface StationHistoryStats {
  readonly min: number;
  readonly max: number;
  readonly avg: number;
  readonly trend: number;
  readonly cheapestDay?: string;
  readonly expensiveDay?: string;
}

export interface StationHistoryResponse {
  readonly stationId: string;
  readonly fuelType: string;
  readonly history: ReadonlyArray<PricePoint>;
  readonly stats: StationHistoryStats | null;
}

export type HistoryRange = '24h' | '7d' | '30d';

interface UseStationHistoryParams {
  readonly stationId: string | null;
  readonly fuelType: string;
  readonly range?: HistoryRange;
  /** Skip the request entirely. Used for off-screen StationCards. */
  readonly enabled?: boolean;
}

export function useStationHistory({
  stationId,
  fuelType,
  range = '24h',
  enabled = true,
}: UseStationHistoryParams) {
  return useQuery<StationHistoryResponse>({
    queryKey: ['station-history', stationId, fuelType, range],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ fuelType, range });
      return fetchJson<StationHistoryResponse>(
        `/api/stations/${stationId}/history?${params.toString()}`,
        { signal },
      );
    },
    enabled: enabled && !!stationId && stationId.length >= 10,
    staleTime: 60_000,                 // matches BFF cache header
    refetchOnWindowFocus: false,
    retry: 1,
    retryDelay: 1_500,
  });
}
