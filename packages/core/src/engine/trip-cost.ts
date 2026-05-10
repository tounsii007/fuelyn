// ============================================================
// Fuelyn — Trip Cost Calculator
//
// Estimates the fuel cost for a trip given:
//   - Start + end coordinates (or a pre-computed route distance)
//   - Vehicle profile (consumption, fuel type, optional tank size)
//   - Current market average price for that fuel
//
// Two distance modes:
//   1. Haversine (great-circle) — instant, no network, but
//      ~10-25 % shorter than driving distance. Good enough for
//      "ballpark cost" widgets.
//   2. Road distance — passed in by the caller (e.g. OSRM
//      response from /api/route). Exact when available.
//
// Output also includes the cheapest matched market price + which
// fuel type that came from, so the UI can show "estimate uses
// 1,79 €/L diesel from your area".
// ============================================================

import type { VehicleProfile, FuelType, Coordinates } from '../domain/types';
import { CO2_FACTOR_KG_PER_LITER } from './co2-tracking';

export interface TripCostEstimate {
  /** Distance used for the calculation in km. */
  distanceKm: number;
  /** Whether `distanceKm` came from road-routing or Haversine. */
  distanceMode: 'haversine' | 'road';
  /** L/100 km from the vehicle profile. */
  consumptionL100: number;
  /** Total liters needed for the round-trip if requested, else one-way. */
  litersNeeded: number;
  /** Fuel type used for pricing. */
  fuelType: FuelType;
  /** €/L applied. */
  pricePerLiter: number;
  /** Total fuel cost in €. */
  costEur: number;
  /** CO₂ emissions in kg from the trip. */
  co2Kg: number;
  /**
   * "Tank fills" the trip would consume — useful for the
   * "you'll need to refuel once" hint when > 1 fill / > 80 %
   * of tank capacity.
   */
  tankFills: number | null;
  /** Whether the user needs to refuel mid-trip. */
  needsRefuel: boolean;
  /** True when the calculation is ROUND-trip (×2). */
  roundTrip: boolean;
}

const EARTH_RADIUS_KM = 6371;

/**
 * Haversine great-circle distance in km between two coords.
 */
export function haversineDistanceKm(a: Coordinates, b: Coordinates): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sin1 = Math.sin(dLat / 2);
  const sin2 = Math.sin(dLng / 2);
  const h = sin1 * sin1 + Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export interface TripCostInputs {
  /** Trip start and end. */
  start: Coordinates;
  end: Coordinates;
  /** Pre-computed road distance (km) when available. */
  roadDistanceKm?: number;
  /** Vehicle profile from the user's settings. */
  vehicle: Pick<VehicleProfile, 'consumption' | 'fuelType' | 'tankCapacity'>;
  /** Current market avg €/L (typically pulled from the snapshot store). */
  pricePerLiter: number;
  /** Round-trip multiplies distance by 2. Default: false. */
  roundTrip?: boolean;
}

const DEFAULT_TANK_CAPACITY_L = 50;

/**
 * Compute a trip-cost estimate from the given inputs.
 *
 * Returns null only when a critical input is missing (e.g.
 * non-finite consumption); otherwise always returns a result
 * the UI can render.
 */
export function estimateTripCost(inputs: TripCostInputs): TripCostEstimate | null {
  const { start, end, roadDistanceKm, vehicle, pricePerLiter, roundTrip } = inputs;

  if (
    !Number.isFinite(vehicle.consumption) ||
    vehicle.consumption == null ||
    vehicle.consumption <= 0
  ) {
    return null;
  }
  if (!Number.isFinite(pricePerLiter) || pricePerLiter <= 0) {
    return null;
  }

  // Distance: prefer road if provided + plausible. Otherwise
  // Haversine. Plausibility = positive number, ≤2× crow-flies
  // (clipping out broken router responses).
  const crowKm = haversineDistanceKm(start, end);
  let distanceKm = crowKm;
  let distanceMode: TripCostEstimate['distanceMode'] = 'haversine';
  if (
    Number.isFinite(roadDistanceKm) &&
    roadDistanceKm != null &&
    roadDistanceKm > 0 &&
    roadDistanceKm <= crowKm * 3
  ) {
    distanceKm = roadDistanceKm;
    distanceMode = 'road';
  }

  if (roundTrip) distanceKm *= 2;

  const litersNeeded = (distanceKm * vehicle.consumption) / 100;
  const costEur = litersNeeded * pricePerLiter;
  const co2Kg = litersNeeded * (CO2_FACTOR_KG_PER_LITER[vehicle.fuelType] ?? 0);

  const tank = vehicle.tankCapacity ?? DEFAULT_TANK_CAPACITY_L;
  const tankFills = tank > 0 ? litersNeeded / tank : null;
  // Users need to refuel mid-trip when they'd burn more than
  // 80 % of their tank — assume they don't start full.
  const needsRefuel = tankFills != null && tankFills > 0.8;

  return {
    distanceKm: Math.round(distanceKm * 10) / 10,
    distanceMode,
    consumptionL100: vehicle.consumption,
    litersNeeded: Math.round(litersNeeded * 100) / 100,
    fuelType: vehicle.fuelType,
    pricePerLiter: Math.round(pricePerLiter * 1000) / 1000,
    costEur: Math.round(costEur * 100) / 100,
    co2Kg: Math.round(co2Kg * 100) / 100,
    tankFills: tankFills != null ? Math.round(tankFills * 100) / 100 : null,
    needsRefuel,
    roundTrip: roundTrip ?? false,
  };
}
