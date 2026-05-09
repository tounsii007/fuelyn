// ============================================================
// CO2 calculator — Phase F.
//
// Estimates the well-to-wheel CO₂-e emissions for a trip, given:
//   • distance (km)
//   • fuel type
//   • vehicle consumption (l/100 km) — defaults if unknown
//
// We use the German Umweltbundesamt's tank-to-wheel + upstream
// well-to-tank emission factors (2024 edition). They're public,
// regulator-grade numbers, and updated annually.
//
// Sources:
//   UBA "Klimabilanz von Pkw-Antrieben 2024", Tab. 4
//   – Diesel:  2.65 kg CO₂/L (TTW) + 0.50 kg/L (WTT)  =  3.15 kg/L
//   – E5:      2.37 kg CO₂/L (TTW) + 0.55 kg/L (WTT)  =  2.92 kg/L
//   – E10:     2.27 kg CO₂/L (TTW) + 0.55 kg/L (WTT)  =  2.82 kg/L
// ============================================================

import type { FuelType } from '../domain/types';

/** Combined well-to-wheel emission factors in kg CO₂-eq per litre. */
const KG_CO2_PER_LITRE: Record<FuelType, number> = {
  diesel: 3.15,
  e5: 2.92,
  e10: 2.82,
};

/**
 * Default fleet-average consumption per fuel type (l/100 km),
 * used when the user hasn't entered a vehicle profile yet.
 * Source: KBA "Verbrauch und CO2-Emissionen von Pkw 2023".
 */
const DEFAULT_CONSUMPTION: Record<FuelType, number> = {
  diesel: 6.2,
  e5: 7.1,
  e10: 7.0,
};

export interface Co2Estimate {
  /** Total CO₂-e in kilograms. */
  totalKg: number;
  /** Equivalent in trees-needed-for-1-year (1 mature tree ≈ 22 kg/yr). */
  treesEquivalent: number;
  /** Litres of fuel burned (rounded to 0.1). */
  litres: number;
  fuelType: FuelType;
  distanceKm: number;
}

/**
 * Estimate CO₂-e for a trip.
 *
 * @param distanceKm Trip distance in kilometres (must be ≥ 0).
 * @param fuelType   Diesel / E5 / E10. EV is out of scope here —
 *                   use the dedicated EV calculator when shipping.
 * @param consumption Optional override in l/100 km. Defaults to the
 *                    KBA fleet average for the fuel type.
 */
export function estimateCo2(
  distanceKm: number,
  fuelType: FuelType,
  consumption?: number,
): Co2Estimate {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    return zero(fuelType);
  }
  const cons = consumption && consumption > 0 ? consumption : DEFAULT_CONSUMPTION[fuelType];
  const litres = (distanceKm * cons) / 100;
  const totalKg = litres * KG_CO2_PER_LITRE[fuelType];
  return {
    totalKg: round(totalKg, 2),
    treesEquivalent: round(totalKg / 22, 2),
    litres: round(litres, 1),
    fuelType,
    distanceKm: round(distanceKm, 1),
  };
}

/**
 * Compare two trip variants and return the savings of A vs B.
 * Useful for "If you take this detour to a cheaper station, you'll
 * also save X kg of CO₂".
 */
export function compareTrips(
  a: Co2Estimate,
  b: Co2Estimate,
): { kgSaved: number; percentSaved: number } {
  if (b.totalKg === 0) return { kgSaved: 0, percentSaved: 0 };
  const kgSaved = b.totalKg - a.totalKg;
  return {
    kgSaved: round(kgSaved, 2),
    percentSaved: round((kgSaved / b.totalKg) * 100, 1),
  };
}

function zero(fuelType: FuelType): Co2Estimate {
  return { totalKg: 0, treesEquivalent: 0, litres: 0, fuelType, distanceKm: 0 };
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
