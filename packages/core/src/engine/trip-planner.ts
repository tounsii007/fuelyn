// ============================================================
// trip-planner — Phase F.
//
// Plans a multi-stop trip and recommends fuel-stops along the
// route based on:
//   • the vehicle's range with current tank level
//   • the price-density of stations near the route corridor
//   • a small "do I want to detour" preference (km penalty)
//
// Inputs are intentionally minimal so this can run in the
// frontend without a network round-trip — the route geometry is
// already on hand from OSRM, and the candidate stations list is
// the recommendations array we already render.
//
// Out of scope (today):
//   • Charging-station equivalent for EVs (separate planner)
//   • Real-time price prediction at the time the user reaches
//     each candidate (would need the AI service's forecaster)
// ============================================================

import type { Station, StationRecommendation, FuelType } from '../domain/types';

export interface VehicleState {
  /** Average consumption in litres/100 km. */
  consumption: number;
  /** Tank capacity in litres. */
  tankCapacity: number;
  /** Current tank level, 0-1. */
  fuelLevel: number;
  /** Active fuel type — used for price lookup on candidate stations. */
  fuelType: FuelType;
}

export interface RoutePoint {
  lat: number;
  lng: number;
  /** Cumulative distance from the start, in km. */
  cumKm: number;
}

export interface TripPlannerInput {
  route: ReadonlyArray<RoutePoint>;
  vehicle: VehicleState;
  candidates: ReadonlyArray<StationRecommendation>;
  /**
   * Maximum acceptable detour from the route corridor in km. Stations
   * further than this are excluded. Default 2 km is a comfortable
   * "next exit" allowance on motorway trips.
   */
  maxDetourKm?: number;
  /**
   * Safety margin: refuel before the tank dips below this fraction.
   * Default 0.15 = 15 % keeps you off the lamp.
   */
  reserveFraction?: number;
}

export interface PlannedStop {
  station: Station;
  /** Cumulative distance along the route at which to stop, in km. */
  atKm: number;
  /** Detour in km from the route. */
  detourKm: number;
  /** Price per litre at this stop (current observed). */
  price: number;
  /** Estimated cost for filling the tank to full. */
  estimatedCost: number;
  /** Why this stop was chosen — for the UI tooltip. */
  reason: 'low-price' | 'last-chance' | 'midway-refuel';
}

export interface TripPlanResult {
  /** Total trip distance in km. */
  totalKm: number;
  /** Number of refuel stops needed end-to-end. */
  stops: PlannedStop[];
  /** Estimated total fuel cost (€). */
  totalFuelCost: number;
  /** True when the vehicle can't reach the destination even with stops. */
  infeasible: boolean;
}

/**
 * Plan refuel stops along a route. Greedy algorithm:
 *
 *   1. Start at km 0 with the current tank level.
 *   2. Compute the farthest km we can reach before hitting the reserve.
 *   3. Among candidates within `maxDetourKm` of the route AND within
 *      reach of the current tank, pick the one with the lowest price.
 *      If none have prices, pick the closest "last-chance" station.
 *   4. Refill the tank, advance to that km, repeat.
 *
 * O(stops × candidates × routePoints) which is ≤ a few thousand
 * iterations end-to-end — runs comfortably in a useMemo.
 */
export function planTrip(input: TripPlannerInput): TripPlanResult {
  const {
    route,
    vehicle,
    candidates,
    maxDetourKm = 2,
    reserveFraction = 0.15,
  } = input;

  if (route.length === 0) {
    return { totalKm: 0, stops: [], totalFuelCost: 0, infeasible: false };
  }

  const totalKm = route[route.length - 1]!.cumKm;

  const stops: PlannedStop[] = [];
  let currentKm = 0;
  let tankLitres = vehicle.tankCapacity * vehicle.fuelLevel;
  let totalCost = 0;

  // Pre-compute station-to-route-point distances so we don't do
  // O(N²) work in the inner loop.
  const stationDistances = candidates
    .map((rec) => ({
      rec,
      ...nearestRoutePoint(rec.station, route),
    }))
    .filter((entry) => entry.detourKm <= maxDetourKm);

  for (let safety = 0; safety < 50; safety += 1) {
    const reachableLitres = tankLitres - vehicle.tankCapacity * reserveFraction;
    const reachableKm = (reachableLitres / vehicle.consumption) * 100;
    const horizonKm = currentKm + reachableKm;

    if (horizonKm >= totalKm) {
      // Can finish without another stop — no further state updates needed
      // since the loop exits immediately. (Previously decremented tankLitres
      // here for symmetry, but the value is never read again before return.)
      currentKm = totalKm;
      break;
    }

    // Stations within range AND ahead of us.
    const inRange = stationDistances
      .filter((s) => s.atKm > currentKm && s.atKm <= horizonKm)
      .sort((a, b) => priceForStop(a.rec, vehicle.fuelType) - priceForStop(b.rec, vehicle.fuelType));

    if (inRange.length === 0) {
      // No station within reach — trip is infeasible.
      return {
        totalKm,
        stops,
        totalFuelCost: totalCost,
        infeasible: true,
      };
    }

    const cheapest = inRange[0]!;
    const price = priceForStop(cheapest.rec, vehicle.fuelType);
    // Drive to the chosen station — burn the corresponding fuel.
    const distToStop = cheapest.atKm - currentKm;
    tankLitres -= (distToStop / 100) * vehicle.consumption;
    const refillLitres = vehicle.tankCapacity - tankLitres;
    const cost = price > 0 ? refillLitres * price : 0;
    totalCost += cost;

    stops.push({
      station: cheapest.rec.station,
      atKm: cheapest.atKm,
      detourKm: cheapest.detourKm,
      price: price > 0 ? price : 0,
      estimatedCost: Number.isFinite(cost) ? cost : 0,
      reason: cheapest.atKm > horizonKm * 0.9 ? 'last-chance' : 'low-price',
    });

    tankLitres = vehicle.tankCapacity;
    currentKm = cheapest.atKm;

    if (currentKm >= totalKm) break;
  }

  if (currentKm < totalKm) {
    return { totalKm, stops, totalFuelCost: totalCost, infeasible: true };
  }
  return { totalKm, stops, totalFuelCost: totalCost, infeasible: false };
}

function priceForStop(rec: StationRecommendation, fuelType: FuelType): number {
  const p = rec.station.prices?.[fuelType];
  return typeof p === 'number' && p > 0 ? p : Number.POSITIVE_INFINITY;
}

interface RouteHit {
  atKm: number;
  detourKm: number;
}

function nearestRoutePoint(station: Station, route: ReadonlyArray<RoutePoint>): RouteHit {
  let best: RouteHit = { atKm: 0, detourKm: Number.POSITIVE_INFINITY };
  for (const p of route) {
    const d = haversineKm(station.lat, station.lng, p.lat, p.lng);
    if (d < best.detourKm) {
      best = { atKm: p.cumKm, detourKm: d };
    }
  }
  return best;
}

const EARTH_KM = 6371;
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function toRad(deg: number): number { return (deg * Math.PI) / 180; }
