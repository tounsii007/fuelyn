// ============================================================
// GeoFenceMount — bridges the store + watcher hook.
//
// Pulls active fences from the store and the latest unified-stations
// data (already cached by React Query for the home page), reshapes
// it into the engine's StationPriceSnapshot format, and runs the
// watcher hook only when there's at least one enabled fence.
// ============================================================

'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import { useGeoFenceWatcher } from './use-geo-fence-watcher';
import { isFuelStation, type GeoFence, type StationPriceSnapshot } from '@tankpilot/core';
import { useUnifiedStations } from '@/lib/hooks/use-unified-stations';

export function GeoFenceMount() {
  const fences = useAppStore((s) => s.geoFences);
  const userLocation = useAppStore((s) => s.userLocation);

  // Reuse the same React-Query cache key as the home page so this
  // component never causes an extra network round-trip.
  const { data: unified } = useUnifiedStations({
    lat: userLocation?.lat ?? null,
    lng: userLocation?.lng ?? null,
    radiusKm: 15,
    energyTypes: ['diesel', 'e5', 'e10'],
    sort: 'dist',
    enabled: !!userLocation && fences.some((f) => f.enabled),
  });

  // Convert UnifiedFuelStation → StationPriceSnapshot (one entry per fuelType).
  const snapshots: StationPriceSnapshot[] = useMemo(() => {
    if (!unified) return [];
    const out: StationPriceSnapshot[] = [];
    for (const u of unified) {
      if (!isFuelStation(u)) continue;
      const prices = u.prices ?? {};
      (['diesel', 'e5', 'e10'] as const).forEach((ft) => {
        const p = prices[ft];
        if (typeof p === 'number' && p > 0) {
          out.push({
            stationId: u.id,
            stationName: u.name,
            brand: u.brand,
            fuelType: ft,
            price: p,
            lat: u.lat,
            lng: u.lng,
          });
        }
      });
    }
    return out;
  }, [unified]);

  // Cast store-shape to engine GeoFence (structurally identical).
  const engineFences: GeoFence[] = useMemo(() => fences as ReadonlyArray<GeoFence> as GeoFence[], [fences]);

  useGeoFenceWatcher({
    enabled: fences.some((f) => f.enabled),
    fences: engineFences,
    prices: snapshots,
  });

  return null;
}
