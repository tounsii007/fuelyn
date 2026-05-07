import type { Coordinates } from '../domain/types';
import { mapOsrmRouteData } from './route/route-mappers';
import { parseOsrmRouteResponse } from './route/route-schema';

export type {
  ManeuverType,
  RouteData,
  RouteManeuver,
  RouteStep,
} from './route/route-types';

const OSRM_BASE = 'https://router.project-osrm.org';

export async function fetchRoute(
  from: Coordinates,
  to: Coordinates,
): Promise<import('./route/route-types').RouteData | null> {
  try {
    const url = `${OSRM_BASE}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    const parsed = parseOsrmRouteResponse(await res.json());
    return parsed ? mapOsrmRouteData(parsed) : null;
  } catch {
    return null;
  }
}
