// ============================================================
// TankPilot Web — Recommendation Hook
// Bridges React Query station data + Zustand vehicle/favorites
// with the core recommendation engine.
// ============================================================

'use client';

import { useMemo } from 'react';
import type { Station, StationRecommendation, SortMode } from '@tankpilot/core';
import { computeRecommendations } from '@tankpilot/core';
import { useAppStore } from '../store/app-store';

export function useRecommendations(
  stations: Station[] | undefined,
  sortMode?: SortMode,
): StationRecommendation[] {
  const vehicle = useAppStore((s) => s.vehicle);
  const favorites = useAppStore((s) => s.favorites);
  const storeSortMode = useAppStore((s) => s.sortMode);
  const filter = useAppStore((s) => s.filter);

  const effectiveSortMode = sortMode ?? storeSortMode;

  return useMemo(() => {
    if (!stations || stations.length === 0) return [];

    // Apply local filters
    let filtered = stations;

    if (filter.onlyOpen) {
      filtered = filtered.filter((s) => s.isOpen);
    }

    if (filter.brands.length > 0) {
      const brandSet = new Set(filter.brands.map((b) => b.toLowerCase()));
      filtered = filtered.filter((s) => brandSet.has(s.brand.toLowerCase()));
    }

    if (filter.priceMin != null) {
      const min = filter.priceMin;
      filtered = filtered.filter((s) => {
        const price = s.prices?.[filter.fuelType];
        return price != null && price >= min;
      });
    }

    if (filter.priceMax != null) {
      const max = filter.priceMax;
      filtered = filtered.filter((s) => {
        const price = s.prices?.[filter.fuelType];
        return price != null && price <= max;
      });
    }

    // Compute recommendations with the engine
    const favoriteIds = new Set(favorites.map((f) => f.stationId));
    const recs = computeRecommendations(filtered, vehicle, {
      favoriteIds,
      excludeUnreachable: false,
    });

    // Apply sort mode
    switch (effectiveSortMode) {
      case 'cheapest':
        return [...recs].sort((a, b) => {
          const pa = a.station.prices?.[filter.fuelType] ?? Infinity;
          const pb = b.station.prices?.[filter.fuelType] ?? Infinity;
          return pa - pb;
        });
      case 'nearest':
        return [...recs].sort((a, b) => a.station.dist - b.station.dist);
      case 'open':
        return [...recs].sort((a, b) => {
          if (a.station.isOpen === b.station.isOpen) return b.scores.overall - a.scores.overall;
          return a.station.isOpen ? -1 : 1;
        });
      case 'recommended':
      default:
        return recs; // already sorted by overall score
    }
  }, [stations, vehicle, favorites, filter, effectiveSortMode]);
}
