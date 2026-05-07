// ============================================================
// Fuelyn — Geo Utilities
// ============================================================

import type { Coordinates } from '../domain/types';

/**
 * Haversine distance between two coordinates in km.
 */
export function haversineDistance(a: Coordinates, b: Coordinates): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);

  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;

  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Check whether coordinates are within Germany's bounding box.
 */
export function isWithinGermany(coords: Coordinates): boolean {
  return (
    coords.lat >= 47.27 &&
    coords.lat <= 55.06 &&
    coords.lng >= 5.87 &&
    coords.lng <= 15.04
  );
}

/**
 * Format coordinates for display.
 */
export function formatCoordinates(coords: Coordinates): string {
  return `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
}
