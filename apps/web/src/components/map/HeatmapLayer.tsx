// ============================================================
// HeatmapLayer — colour-coded price-density overlay.
//
// Why not leaflet.heat?
//   leaflet.heat renders a Gaussian blur on a canvas — beautiful for
//   point-density (e.g. crime maps), wrong for price intensity. We
//   actually want each station's *price tier* visible, not a blob
//   that conflates ten cheap stations with one mediocre one. So we
//   render translucent CircleMarkers, each tinted by the station's
//   price relative to the visible cohort.
//
// Visual contract:
//   • Cheapest 33% → emerald (16 185 129)
//   • Mid 33%      → amber  (245 158 11)
//   • Top 33%      → rose   (244 63 94)
//   • Radius scales gently with map zoom so close-zoom still feels
//     atmospheric without obliterating the underlying tile labels.
// ============================================================

'use client';

import { useMemo } from 'react';
import { CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import { useState, useEffect } from 'react';
import type { StationRecommendation } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';

interface HeatmapLayerProps {
  recommendations: ReadonlyArray<StationRecommendation>;
}

type Tier = 'low' | 'mid' | 'high';

const TIER_COLOR: Record<Tier, string> = {
  low: '#10B981',  // emerald
  mid: '#F59E0B',  // amber
  high: '#F43F5E', // rose
};

export function HeatmapLayer({ recommendations }: HeatmapLayerProps) {
  const fuelType = useAppStore((s) => s.filter.fuelType);
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  // Track zoom so the heatmap radius adapts: more zoomed-in → smaller
  // bubbles so they don't completely cover the map. This is reactive
  // rather than imperative so React state stays in sync.
  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  });

  useEffect(() => {
    setZoom(map.getZoom());
  }, [map]);

  // ─── Tier classification + radius scaling ─────────────────
  const points = useMemo(() => {
    const priced = recommendations
      .map((r) => ({
        id: r.station.id,
        lat: r.station.lat,
        lng: r.station.lng,
        p: r.station.prices?.[fuelType],
      }))
      .filter(
        (x): x is { id: string; lat: number; lng: number; p: number } =>
          typeof x.p === 'number' && x.p > 0,
      );
    if (priced.length === 0) return [];

    if (priced.length < 3) {
      // Too few to bucket meaningfully — paint everything mid.
      return priced.map((p) => ({ ...p, tier: 'mid' as const }));
    }

    const sorted = [...priced].sort((a, b) => a.p - b.p);
    const lowCut = sorted[Math.floor(sorted.length * 0.33)]!.p;
    const highCut = sorted[Math.floor(sorted.length * 0.67)]!.p;
    return priced.map((p) => ({
      ...p,
      tier: (p.p <= lowCut ? 'low' : p.p >= highCut ? 'high' : 'mid') as Tier,
    }));
  }, [recommendations, fuelType]);

  // Radius shrinks as we zoom in so dense clusters at close zoom
  // don't merge into one giant blob and the underlying tile labels
  // remain legible.
  const radiusPx = useMemo(() => {
    if (zoom >= 16) return 14;
    if (zoom >= 14) return 24;
    if (zoom >= 12) return 36;
    if (zoom >= 10) return 50;
    return 70;
  }, [zoom]);

  if (points.length === 0) return null;

  return (
    <>
      {points.map((p) => (
        <CircleMarker
          key={`heat-${p.id}`}
          center={[p.lat, p.lng]}
          radius={radiusPx}
          pathOptions={{
            color: TIER_COLOR[p.tier],
            weight: 0,
            fillColor: TIER_COLOR[p.tier],
            fillOpacity: p.tier === 'low' ? 0.32 : p.tier === 'high' ? 0.22 : 0.18,
            // Disable interaction so heatmap circles don't intercept
            // marker clicks underneath them.
            interactive: false,
          }}
        />
      ))}
    </>
  );
}
