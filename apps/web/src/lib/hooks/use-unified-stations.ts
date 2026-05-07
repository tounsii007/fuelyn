// ============================================================
// TankPilot — Unified Stations Hook
// Queries the /api/unified endpoint for all station types
// based on selected energy types. Replaces the combination of
// useStationSearch + useChargingStations for the expanded model.
// ============================================================

'use client';

import { useQuery } from '@tanstack/react-query';
import type { EnergyType, UnifiedStation } from '@tankpilot/core';
import { fetchJson } from '../http/fetch-json';

interface UseUnifiedStationsParams {
  lat: number | null;
  lng: number | null;
  radiusKm: number;
  energyTypes: readonly EnergyType[];
  sort?: 'dist' | 'price';
  enabled?: boolean;
}

interface UnifiedStationsResponse {
  stations: UnifiedStation[];
}

/**
 * Hook to fetch unified stations from the BFF.
 * Combines fuel, charging, H2, and gas stations into a single query.
 */
export function useUnifiedStations({
  lat,
  lng,
  radiusKm,
  energyTypes,
  sort = 'dist',
  enabled = true,
}: UseUnifiedStationsParams) {
  const typesKey = [...energyTypes].sort().join(',');

  return useQuery<UnifiedStation[]>({
    queryKey: ['unified-stations', lat?.toFixed(3), lng?.toFixed(3), radiusKm, typesKey, sort],
    queryFn: async ({ signal }) => {
      if (lat == null || lng == null) return [];

      const params = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
        rad: String(radiusKm),
        types: typesKey,
        sort,
      });

      const data = await fetchJson<UnifiedStationsResponse>(
        `/api/unified?${params}`,
        { signal, timeoutMs: 15_000 },
      );

      return data.stations ?? [];
    },
    enabled: enabled && lat != null && lng != null && energyTypes.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: 1_000,
  });
}
