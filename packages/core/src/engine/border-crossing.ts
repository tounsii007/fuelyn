// ============================================================
// Border-Crossing Fuel Optimisation
//
// For users in DE/AT/CH border regions, the *cheapest fuel often
// lives in the next country*. Luxembourg's diesel is consistently
// 25–30 ct/L below the German national mean; Czechia and Poland
// are 20+ ct/L cheaper for E10. A 30-litre tank therefore saves
// €6–10 per fill — easily worth a 15-minute detour.
//
// This engine answers two questions:
//
//   1) "Am I close enough to a foreign border that crossing makes
//      sense for the next refuel?"
//   2) "If yes, which country, how far away, and what's the
//      typical EUR/L savings vs. my home country's average?"
//
// We do NOT call any pricing API here. Live prices for foreign
// stations are out of scope (Tankerkönig is DE-only); we surface a
// CALIBRATED ESTIMATE based on monthly EU fuel-bulletin averages
// (Mar 2026 readings, see CITATION below) plus a hand-curated set
// of representative border-crossing waypoints. The UI presents the
// number as an estimate, never as a live price.
//
// CITATION: EU Weekly Oil Bulletin (March 2026 averages). Values
// are reviewed manually — the UI is honest about this in the
// `confidence` field of the result.
// ============================================================

import { haversineDistance } from '../utils/geo';
import type { Coordinates, FuelType } from '../domain/types';

// -----------------------------------------------------------------
// Static reference data
// -----------------------------------------------------------------

/** ISO-3166-1 alpha-2 country code we surface for border detection. */
export type BorderCountry =
  | 'LU'
  | 'FR'
  | 'CH'
  | 'AT'
  | 'CZ'
  | 'PL'
  | 'NL'
  | 'BE'
  | 'DK';

/** A representative border-crossing waypoint inside the foreign country. */
interface BorderWaypoint {
  country: BorderCountry;
  /** Display name in German (UI overrides via i18n). */
  cityDe: string;
  /** Coordinates of a representative refuel-stop near the border. */
  point: Coordinates;
}

/**
 * Hand-curated list of border-crossing fuel-up points just inside the
 * foreign country. Multiple waypoints per country where the border
 * runs long enough that one point alone wouldn't cover all reachable
 * users (AT, CZ, FR). Lookup stays O(N) with N ≈ 14 — instant.
 */
export const BORDER_WAYPOINTS: readonly BorderWaypoint[] = [
  { country: 'LU', cityDe: 'Wasserbillig (LU)',     point: { lat: 49.7137, lng: 6.4974 } },
  // FR — three crossings cover Saarland/Pfalz, Alsace, and the Black Forest.
  { country: 'FR', cityDe: 'Forbach (FR)',          point: { lat: 49.1894, lng: 6.9008 } },
  { country: 'FR', cityDe: 'Strasbourg (FR)',       point: { lat: 48.5734, lng: 7.7521 } },
  { country: 'FR', cityDe: 'Mulhouse (FR)',         point: { lat: 47.7508, lng: 7.3359 } },
  { country: 'CH', cityDe: 'Basel (CH)',            point: { lat: 47.5596, lng: 7.5886 } },
  // AT — Salzburg covers Bavaria, Schärding/Suben covers the Passau corner,
  // Bregenz covers the Vorarlberg/Allgäu border.
  { country: 'AT', cityDe: 'Suben (AT)',            point: { lat: 48.4639, lng: 13.4308 } },
  { country: 'AT', cityDe: 'Salzburg (AT)',         point: { lat: 47.8095, lng: 13.0550 } },
  { country: 'AT', cityDe: 'Bregenz (AT)',          point: { lat: 47.5031, lng: 9.7471 } },
  // CZ — Cheb covers Egerland/Oberpfalz, Hrádek nad Nisou covers Zittau,
  // Děčín covers the Saxon-Switzerland axis.
  { country: 'CZ', cityDe: 'Cheb / Eger (CZ)',      point: { lat: 50.0795, lng: 12.3700 } },
  { country: 'CZ', cityDe: 'Děčín (CZ)',            point: { lat: 50.7820, lng: 14.2147 } },
  { country: 'CZ', cityDe: 'Hrádek nad Nisou (CZ)', point: { lat: 50.8512, lng: 14.8492 } },
  { country: 'PL', cityDe: 'Słubice (PL)',          point: { lat: 52.3492, lng: 14.5589 } },
  { country: 'NL', cityDe: 'Venlo (NL)',            point: { lat: 51.3704, lng: 6.1724 } },
  { country: 'BE', cityDe: 'Eupen (BE)',            point: { lat: 50.6326, lng: 6.0364 } },
  { country: 'DK', cityDe: 'Padborg (DK)',          point: { lat: 54.8225, lng: 9.3589 } },
];

/**
 * Typical price differential (foreign country - home DE), per fuel
 * type, in EUR/L. Negative = foreign country cheaper.
 *
 * Source: EU Weekly Oil Bulletin, March 2026 monthly averages.
 * These are FOR DISPLAY HINTS ONLY — never present them as live prices.
 */
const PRICE_DELTA_VS_DE: Readonly<Record<BorderCountry, Readonly<Record<FuelType, number>>>> = {
  LU: { diesel: -0.27, e5: -0.20, e10: -0.18 },
  FR: { diesel: -0.05, e5: -0.02, e10:  0.00 },
  CH: { diesel: +0.18, e5: +0.22, e10: +0.24 }, // CHF→EUR & VAT
  AT: { diesel: -0.06, e5: -0.04, e10: -0.04 },
  CZ: { diesel: -0.22, e5: -0.20, e10: -0.20 },
  PL: { diesel: -0.21, e5: -0.18, e10: -0.18 },
  NL: { diesel: +0.05, e5: +0.12, e10: +0.10 },
  BE: { diesel: -0.04, e5: -0.02, e10: -0.02 },
  DK: { diesel: +0.18, e5: +0.20, e10: +0.20 },
};

// -----------------------------------------------------------------
// Public types
// -----------------------------------------------------------------

export interface BorderHint {
  country: BorderCountry;
  cityDe: string;
  /** Air-distance from the user's coords to the waypoint, km. */
  distanceKm: number;
  /** Estimated EUR/L delta for the user's preferred fuel.  Negative = cheaper there. */
  estimatedSavingsEurPerL: number;
  /** Per-fuel-type EUR/L delta table (always populated). */
  estimatedDeltaByFuel: Readonly<Record<FuelType, number>>;
  /** Confidence label so the UI can be honest about the estimate. */
  confidence: 'static-estimate';
  /** True iff distance ≤ thresholdKm AND savings make the detour worthwhile. */
  worthwhile: boolean;
  /**
   * Estimated euro-savings for ONE typical fill-up at the user's vehicle
   * size. Optional — only set if `vehicleTankL` was passed in.
   */
  estimatedSavingsPerFillEur?: number;
}

export interface BorderHintInputs {
  /** User's current location. */
  origin: Coordinates;
  /** Fuel the user normally buys — drives the EUR/L delta column we use. */
  fuelType: FuelType;
  /**
   * Maximum air-distance to the foreign waypoint we'll consider
   * "worthwhile". Default 60 km — tuned for typical refuel-detour psychology.
   */
  thresholdKm?: number;
  /** Tank size in litres — only used to compute per-fill savings. */
  vehicleTankL?: number;
  /**
   * Minimum savings (EUR/L, absolute value) needed to flag a hint as
   * worthwhile. Default 0.05 €/L. Anything below isn't worth the detour.
   */
  minDeltaEurPerL?: number;
}

export interface BorderHintResult {
  /**
   * Closest waypoint regardless of savings — useful for the "you're near a
   * border" message even when crossing wouldn't help (e.g. NL diesel is
   * more expensive than DE).
   */
  nearest: BorderHint | null;
  /**
   * Best opportunity within the threshold: the waypoint whose
   * per-fill euro-savings (or, if no tank size given, EUR/L delta) is
   * largest in absolute value AND negative (foreign side is cheaper).
   * `null` when no neighbour is both close and meaningfully cheaper.
   */
  best: BorderHint | null;
}

// -----------------------------------------------------------------
// Engine
// -----------------------------------------------------------------

const DEFAULT_THRESHOLD_KM = 60;
const DEFAULT_MIN_DELTA = 0.05;

export function evaluateBorderHints(inputs: BorderHintInputs): BorderHintResult {
  const {
    origin,
    fuelType,
    thresholdKm = DEFAULT_THRESHOLD_KM,
    vehicleTankL,
    minDeltaEurPerL = DEFAULT_MIN_DELTA,
  } = inputs;

  let nearest: BorderHint | null = null;
  let best: BorderHint | null = null;

  for (const wp of BORDER_WAYPOINTS) {
    const distanceKm = haversineDistance(origin, wp.point);
    const deltas = PRICE_DELTA_VS_DE[wp.country];
    const delta = deltas[fuelType];
    const worthwhile =
      distanceKm <= thresholdKm && delta <= -minDeltaEurPerL;

    const hint: BorderHint = {
      country: wp.country,
      cityDe: wp.cityDe,
      distanceKm,
      estimatedSavingsEurPerL: delta,
      estimatedDeltaByFuel: deltas,
      confidence: 'static-estimate',
      worthwhile,
      ...(vehicleTankL && Number.isFinite(vehicleTankL) && vehicleTankL > 0
        ? { estimatedSavingsPerFillEur: -delta * vehicleTankL }
        : {}),
    };

    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = hint;
    }

    if (worthwhile) {
      // Rank "best" by absolute savings (per-fill EUR if available, else
      // EUR/L). Negative deltas only — can't recommend a more expensive
      // border.
      const score = vehicleTankL
        ? hint.estimatedSavingsPerFillEur ?? Math.abs(delta)
        : Math.abs(delta);
      const bestScore = best
        ? vehicleTankL
          ? best.estimatedSavingsPerFillEur ?? Math.abs(best.estimatedSavingsEurPerL)
          : Math.abs(best.estimatedSavingsEurPerL)
        : -Infinity;
      if (score > bestScore) best = hint;
    }
  }

  return { nearest, best };
}
