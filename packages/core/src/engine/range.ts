// ============================================================
// Fuelyn — Range Calculation
// Computes remaining range from vehicle profile and determines
// station reachability.
// ============================================================

import type { ReachabilityStatus, Station, VehicleProfile } from '../domain/types';
import { RANGE_SAFETY_RESERVE_KM, RANGE_UNREACHABLE_FACTOR } from '../config/constants';

/**
 * Derive the effective remaining range in km from the vehicle profile.
 *
 * Depending on the unit the user chose, we either use the range directly
 * or calculate it from fuel level + consumption.
 */
export function computeRemainingRange(vehicle: VehicleProfile): number | null {
  const { currentFuelLevel, currentFuelUnit, consumption, tankCapacity, currentRange } = vehicle;

  if (consumption <= 0) return null;

  switch (currentFuelUnit) {
    case 'km':
      return currentRange;

    case 'liters': {
      if (currentFuelLevel == null) return null;
      // range = (liters / consumption) * 100
      return (currentFuelLevel / consumption) * 100;
    }

    case 'percentage': {
      if (currentFuelLevel == null || tankCapacity == null) return null;
      const liters = (currentFuelLevel / 100) * tankCapacity;
      return (liters / consumption) * 100;
    }

    default:
      return null;
  }
}

/**
 * Determine how reachable a station is given the remaining range.
 *
 * - `safe`:        distance < range - safety reserve
 * - `tight`:       distance < range * unreachable factor
 * - `unreachable`: distance >= range * unreachable factor
 */
export function computeReachability(
  distanceKm: number,
  remainingRangeKm: number | null,
): ReachabilityStatus {
  if (remainingRangeKm == null) {
    // No range data → assume safe (user hasn't entered data)
    return 'safe';
  }

  if (distanceKm <= remainingRangeKm - RANGE_SAFETY_RESERVE_KM) {
    return 'safe';
  }

  if (distanceKm < remainingRangeKm * RANGE_UNREACHABLE_FACTOR) {
    return 'tight';
  }

  return 'unreachable';
}

/**
 * Estimate the fuel cost (EUR) to drive to a station.
 * Uses the station's own price for the user's fuel type.
 */
export function estimateFuelCost(
  distanceKm: number,
  consumption: number,
  pricePerLiter: number | null,
): number {
  if (pricePerLiter == null || consumption <= 0) return 0;
  const litersNeeded = (distanceKm / 100) * consumption;
  return Math.round(litersNeeded * pricePerLiter * 100) / 100;
}

/**
 * Estimate drive time in minutes based on average speed.
 */
export function estimateDriveTime(
  distanceKm: number,
  averageSpeedKmh: number,
): number {
  if (averageSpeedKmh <= 0) return 0;
  return Math.round((distanceKm / averageSpeedKmh) * 60);
}

/**
 * Filter stations that are reachable given vehicle range.
 * Returns all stations if no range data is available.
 */
export function filterReachableStations(
  stations: readonly Station[],
  remainingRangeKm: number | null,
): Station[] {
  if (remainingRangeKm == null) return [...stations];

  return stations.filter(
    (s) => s.dist < remainingRangeKm * RANGE_UNREACHABLE_FACTOR,
  );
}
