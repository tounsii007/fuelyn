// ============================================================
// RouteLayer — Draws driving route polyline on the map
// ============================================================

'use client';

import { useEffect, useMemo } from 'react';
import { Polyline, useMap } from 'react-leaflet';
import { useAppStore } from '@/lib/store/app-store';

export function RouteLayer() {
  const activeRoute = useAppStore((s) => s.activeRoute);
  const map = useMap();
  const positions = useMemo<[number, number][]>(
    () => activeRoute?.coordinates.map(([lat, lng]) => [lat, lng]) ?? [],
    [activeRoute],
  );

  // Fit map to route bounds when route changes
  useEffect(() => {
    if (positions.length < 2) return;
    map.fitBounds(positions, {
      padding: [60, 60],
      maxZoom: 15,
      duration: 0.8,
    });
  }, [map, positions]);

  if (positions.length < 2) return null;

  return (
    <>
      {/* Route shadow for depth effect */}
      <Polyline
        positions={positions}
        pathOptions={{
          color: '#1e40af',
          weight: 8,
          opacity: 0.15,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
      {/* Main route line */}
      <Polyline
        positions={positions}
        pathOptions={{
          color: '#2575EA',
          weight: 5,
          opacity: 0.85,
          lineCap: 'round',
          lineJoin: 'round',
          dashArray: undefined,
        }}
      />
      {/* Route highlight on top */}
      <Polyline
        positions={positions}
        pathOptions={{
          color: '#60a5fa',
          weight: 2,
          opacity: 0.4,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
    </>
  );
}
