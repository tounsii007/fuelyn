// ============================================================
// Fuelyn Web — Charging Station Hook (OpenChargeMap)
// ============================================================

'use client';

import { useQuery } from '@tanstack/react-query';
import type { ChargingStation } from '@fuelyn/core';
import { fetchJson } from '../http/fetch-json';

async function fetchChargingStations(params: {
  lat: number;
  lng: number;
  rad: number;
  signal?: AbortSignal;
}): Promise<ChargingStation[]> {
  const qs = new URLSearchParams({
    lat: String(params.lat),
    lng: String(params.lng),
    rad: String(params.rad),
  });

  const data = await fetchJson<{ stations?: ChargingStation[] }>(
    `/api/charging?${qs}`,
    { signal: params.signal },
  );
  return Array.isArray(data.stations) ? data.stations : [];
}

export function useChargingStations(params: {
  lat: number | null;
  lng: number | null;
  radiusKm: number;
  enabled?: boolean;
}) {
  const { lat, lng, radiusKm, enabled = true } = params;

  const roundedLat = lat != null ? Math.round(lat * 100) / 100 : null;
  const roundedLng = lng != null ? Math.round(lng * 100) / 100 : null;

  return useQuery({
    queryKey: ['charging', roundedLat, roundedLng, Math.round(radiusKm)],
    queryFn: ({ signal }) =>
      fetchChargingStations({
        lat: lat!,
        lng: lng!,
        rad: Math.min(radiusKm, 50),
        signal,
      }),
    enabled: enabled && lat != null && lng != null,
    staleTime: 5 * 60 * 1000, // 5 min cache
    retry: 1,
  });
}
