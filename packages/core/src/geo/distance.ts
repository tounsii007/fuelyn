// ============================================================
// Geographic helpers — pure, allocation-free, framework-free.
//
// All functions operate on plain {lat, lng} pairs. Distances are in
// kilometers. Implementations are deliberately straight-line (great-circle)
// rather than routed — they're used for "is this point near X?" gating,
// not for navigation.
// ============================================================

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

/** Earth mean radius in km (WGS-84). */
export const EARTH_RADIUS_KM = 6371.0088;

/**
 * Great-circle distance (kilometers) between two coordinates using the
 * haversine formula. Numerically stable for both small and large angles.
 *
 * Approx. 25 ns per call on modern V8 — safe to call thousands of times
 * per frame.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Equirectangular fast-distance approximation (kilometers).
 *
 * For radii smaller than ~50 km this is within 0.1% of haversine, while
 * being ~3× faster — ideal for the inner loop of "is this station inside
 * the geo-fence?" checks.
 */
export function equirectangularKm(a: LatLng, b: LatLng): number {
  const x = toRad(b.lng - a.lng) * Math.cos(toRad((a.lat + b.lat) / 2));
  const y = toRad(b.lat - a.lat);
  return Math.sqrt(x * x + y * y) * EARTH_RADIUS_KM;
}

/** Returns whether {@code point} lies inside the circle of radius {@code radiusKm} around {@code center}. */
export function isInsideCircle(point: LatLng, center: LatLng, radiusKm: number): boolean {
  // Cheap bounding-box pre-filter to skip the trig work for far-away points.
  const latDelta = radiusKm / 111.32;
  if (Math.abs(point.lat - center.lat) > latDelta) return false;
  const lngDelta = radiusKm / (111.32 * Math.cos(toRad(center.lat)) || 1);
  if (Math.abs(point.lng - center.lng) > lngDelta) return false;
  return equirectangularKm(point, center) <= radiusKm;
}

/** Axis-aligned bounding box covering a circle of radiusKm around center. */
export interface BoundingBox {
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLng: number;
  readonly maxLng: number;
}

export function boundingBoxKm(center: LatLng, radiusKm: number): BoundingBox {
  const latDelta = radiusKm / 111.32;
  const lngDelta = radiusKm / (111.32 * Math.cos(toRad(center.lat)) || 1);
  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta,
    maxLng: center.lng + lngDelta,
  };
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
