// ============================================================
// Multi-Stop Route Optimizer
//
// Solves "given a fixed start (and optional fixed end) plus a
// set of intermediate stops, what visiting order minimises total
// travel distance?"  In TSP-speak: an open or closed shortest-
// Hamiltonian-path problem with fixed endpoints.
//
// Two solvers, picked automatically based on the number of
// intermediate stops:
//
//   * heldKarp (≤ 12 stops): exact dynamic programming,
//     O(n²·2ⁿ).  At 12 stops that's 12²·4096 ≈ 590k ops —
//     instant in the browser.
//
//   * nearestNeighbour + 2-opt (> 12 stops): greedy
//     construction followed by an O(n²) per-iteration local
//     search.  Not optimal, but typically within 5% of optimal
//     and stays under 50 ms for n = 50.
//
// The engine is pure: in-out is plain { lat, lng } pairs and
// the result is an array of indexes into the original `stops`
// array.  Distance is haversine (great-circle) — for routing
// purposes (km/€/CO₂ estimates) that's accurate enough to within
// a couple of percent compared to road-network distance.
// ============================================================

import { haversineDistance } from '../utils/geo';
import type { Coordinates } from '../domain/types';

// -----------------------------------------------------------------
// Types
// -----------------------------------------------------------------

export interface OptimizeStopsInputs {
  /** Required start point — the optimiser fixes this as the first leg. */
  start: Coordinates;
  /**
   * Required end point.
   *   * undefined → open path: optimiser is free to terminate at the
   *     stop that ends up cheapest to reach last.
   *   * present   → closed path: route must end at this point.
   */
  end?: Coordinates;
  /** Intermediate stops to be visited exactly once each. */
  stops: ReadonlyArray<Coordinates>;
}

export interface OptimizeStopsResult {
  /**
   * Order in which to visit the stops.  Indexes into the original
   * `stops` array.  Length === stops.length.
   */
  order: readonly number[];
  /** Total air-distance in km of the optimised route (start → … → end?). */
  distanceKm: number;
  /**
   * Distance of the route assuming the user kept the original input
   * order.  Useful to surface "you saved X km" in the UI.
   */
  baselineDistanceKm: number;
  /** baselineDistanceKm − distanceKm.  ≥ 0 by construction. */
  savedKm: number;
  /** Which solver was used — 'exact' for ≤12 stops, 'heuristic' otherwise. */
  solver: 'exact' | 'heuristic';
}

// -----------------------------------------------------------------
// Public entry-point
// -----------------------------------------------------------------

const HELD_KARP_MAX_STOPS = 12;

export function optimizeStops(inputs: OptimizeStopsInputs): OptimizeStopsResult {
  const { start, end, stops } = inputs;

  // Edge cases — a 0-or-1-stop trip has nothing to optimise.
  if (stops.length === 0) {
    const direct = end ? haversineDistance(start, end) : 0;
    return {
      order: [],
      distanceKm: direct,
      baselineDistanceKm: direct,
      savedKm: 0,
      solver: 'exact',
    };
  }
  if (stops.length === 1) {
    const dist =
      haversineDistance(start, stops[0]!) +
      (end ? haversineDistance(stops[0]!, end) : 0);
    return {
      order: [0],
      distanceKm: dist,
      baselineDistanceKm: dist,
      savedKm: 0,
      solver: 'exact',
    };
  }

  const baseline = pathDistance(start, stops, defaultRange(stops.length), end);
  const order =
    stops.length <= HELD_KARP_MAX_STOPS
      ? heldKarp(start, stops, end)
      : twoOpt(nearestNeighbour(start, stops, end), start, stops, end);
  const distanceKm = pathDistance(start, stops, order, end);

  return {
    order,
    distanceKm,
    baselineDistanceKm: baseline,
    savedKm: Math.max(0, baseline - distanceKm),
    solver: stops.length <= HELD_KARP_MAX_STOPS ? 'exact' : 'heuristic',
  };
}

// -----------------------------------------------------------------
// Distance helpers
// -----------------------------------------------------------------

function defaultRange(n: number): number[] {
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = i;
  return out;
}

function pathDistance(
  start: Coordinates,
  stops: ReadonlyArray<Coordinates>,
  order: ReadonlyArray<number>,
  end: Coordinates | undefined,
): number {
  if (order.length === 0) return end ? haversineDistance(start, end) : 0;
  let total = haversineDistance(start, stops[order[0]!]!);
  for (let i = 1; i < order.length; i++) {
    total += haversineDistance(stops[order[i - 1]!]!, stops[order[i]!]!);
  }
  if (end) total += haversineDistance(stops[order[order.length - 1]!]!, end);
  return total;
}

// -----------------------------------------------------------------
// Held-Karp (exact DP) — open/closed Hamiltonian path
//
// dp[mask][last] = shortest distance from `start` that visits the
// set of stops described by `mask` and ends at stop index `last`.
// Final answer iterates over all (full-mask, last) candidates,
// adding the leg from `last` to `end` if a closed path is asked
// for.
// -----------------------------------------------------------------

function heldKarp(
  start: Coordinates,
  stops: ReadonlyArray<Coordinates>,
  end: Coordinates | undefined,
): number[] {
  const n = stops.length;
  const fullMask = (1 << n) - 1;
  // dp + parent indexed as [mask * n + last].
  const dp = new Float64Array((fullMask + 1) * n).fill(Infinity);
  const parent = new Int32Array((fullMask + 1) * n).fill(-1);
  // Pre-compute pairwise distances (start at index n; stops 0..n-1).
  const startDist = new Float64Array(n);
  for (let i = 0; i < n; i++) startDist[i] = haversineDistance(start, stops[i]!);
  const between = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      between[i * n + j] = i === j ? 0 : haversineDistance(stops[i]!, stops[j]!);

  // Base case: visit only stop i.
  for (let i = 0; i < n; i++) {
    const mask = 1 << i;
    dp[mask * n + i] = startDist[i]!;
  }

  // Iterate over masks in ascending order so subsets are processed
  // before their supersets.
  for (let mask = 1; mask <= fullMask; mask++) {
    for (let last = 0; last < n; last++) {
      if (!(mask & (1 << last))) continue;
      const here = dp[mask * n + last]!;
      if (!Number.isFinite(here)) continue;
      // Try to extend to every unvisited stop `next`.
      for (let next = 0; next < n; next++) {
        if (mask & (1 << next)) continue;
        const nextMask = mask | (1 << next);
        const cand = here + between[last * n + next]!;
        if (cand < dp[nextMask * n + next]!) {
          dp[nextMask * n + next] = cand;
          parent[nextMask * n + next] = last;
        }
      }
    }
  }

  // Pick the best terminating stop.
  let best = Infinity;
  let bestLast = -1;
  for (let last = 0; last < n; last++) {
    const total = dp[fullMask * n + last]! + (end ? haversineDistance(stops[last]!, end) : 0);
    if (total < best) {
      best = total;
      bestLast = last;
    }
  }

  // Reconstruct the order by walking the parent table backwards.
  const order: number[] = [];
  let mask = fullMask;
  let cur = bestLast;
  while (cur >= 0) {
    order.push(cur);
    const prev = parent[mask * n + cur]!;
    mask &= ~(1 << cur);
    cur = prev;
  }
  return order.reverse();
}

// -----------------------------------------------------------------
// Heuristics — used when n exceeds Held-Karp's comfort zone
// -----------------------------------------------------------------

function nearestNeighbour(
  start: Coordinates,
  stops: ReadonlyArray<Coordinates>,
  _end: Coordinates | undefined,
): number[] {
  const n = stops.length;
  const visited = new Uint8Array(n);
  const order: number[] = [];
  let current: Coordinates = start;
  for (let i = 0; i < n; i++) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let j = 0; j < n; j++) {
      if (visited[j]) continue;
      const d = haversineDistance(current, stops[j]!);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = j;
      }
    }
    visited[bestIdx] = 1;
    order.push(bestIdx);
    current = stops[bestIdx]!;
  }
  return order;
}

function twoOpt(
  initial: number[],
  start: Coordinates,
  stops: ReadonlyArray<Coordinates>,
  end: Coordinates | undefined,
): number[] {
  // Cap iterations so worst-case stays bounded — for our use case
  // (≤ 50 stops) one full sweep is plenty.
  const MAX_PASSES = 4;
  let order = initial.slice();
  let bestDist = pathDistance(start, stops, order, end);
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const candidate = reverseSegment(order, i, j);
        const candDist = pathDistance(start, stops, candidate, end);
        if (candDist + 1e-9 < bestDist) {
          order = candidate;
          bestDist = candDist;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return order;
}

function reverseSegment(arr: number[], i: number, j: number): number[] {
  const out = arr.slice();
  while (i < j) {
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
    i++;
    j--;
  }
  return out;
}
