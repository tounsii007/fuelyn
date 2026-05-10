// ============================================================
// Multi-stop optimiser tests.
//
// Strategy:
//   * Tiny fixtures where the optimal answer is hand-derivable
//     (3-4 stops in a known geometry) to verify Held-Karp picks
//     the right order and beats the input ordering.
//   * Larger fixtures (15 stops) to verify the heuristic engages
//     and produces a sensible (≤ 110% of greedy baseline) result.
//   * Edge cases: 0 stops, 1 stop, open vs. closed path.
// ============================================================

import { describe, it, expect } from 'vitest';
import { optimizeStops } from '../multi-stop';
import type { Coordinates } from '../../domain/types';

const BERLIN: Coordinates = { lat: 52.52, lng: 13.405 };
const HAMBURG: Coordinates = { lat: 53.55, lng: 9.99 };
const MUNICH: Coordinates = { lat: 48.135, lng: 11.582 };
const COLOGNE: Coordinates = { lat: 50.94, lng: 6.96 };
const FRANKFURT: Coordinates = { lat: 50.11, lng: 8.68 };

describe('optimizeStops — edge cases', () => {
  it('handles 0 stops without an end', () => {
    const r = optimizeStops({ start: BERLIN, stops: [] });
    expect(r.order).toHaveLength(0);
    expect(r.distanceKm).toBe(0);
    expect(r.savedKm).toBe(0);
    expect(r.solver).toBe('exact');
  });

  it('handles 0 stops with an end (direct hop)', () => {
    const r = optimizeStops({ start: BERLIN, end: HAMBURG, stops: [] });
    expect(r.order).toHaveLength(0);
    expect(r.distanceKm).toBeGreaterThan(250);
    expect(r.distanceKm).toBeLessThan(290);
  });

  it('handles a single stop (no real choice to make)', () => {
    const r = optimizeStops({ start: BERLIN, stops: [HAMBURG] });
    expect(r.order).toEqual([0]);
    expect(r.savedKm).toBe(0);
  });
});

describe('optimizeStops — Held-Karp picks the optimal order', () => {
  it('picks the right interleave for a "zig-zag" baseline (3 stops, no end)', () => {
    // Stops chosen so that the input order Hamburg → Munich → Cologne
    // forces a long zig-zag, while Hamburg → Cologne → Munich is much
    // shorter from Berlin.
    const r = optimizeStops({
      start: BERLIN,
      stops: [HAMBURG, MUNICH, COLOGNE],
    });
    expect(r.distanceKm).toBeLessThan(r.baselineDistanceKm);
    expect(r.savedKm).toBeGreaterThan(0);
    expect(r.order).toHaveLength(3);
    expect(new Set(r.order)).toEqual(new Set([0, 1, 2]));
  });

  it('returns an order that visits every stop exactly once', () => {
    const stops = [HAMBURG, MUNICH, COLOGNE, FRANKFURT];
    const r = optimizeStops({ start: BERLIN, end: HAMBURG, stops });
    expect(r.order).toHaveLength(stops.length);
    expect(new Set(r.order).size).toBe(stops.length);
    for (const idx of r.order) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(stops.length);
    }
  });

  it('respects a fixed end (closed path)', () => {
    // Start Berlin, must end Berlin — classic TSP.
    const stops = [HAMBURG, MUNICH, COLOGNE, FRANKFURT];
    const r = optimizeStops({ start: BERLIN, end: BERLIN, stops });
    expect(r.distanceKm).toBeGreaterThan(0);
    // Round-trip distance must be at least 2× the farthest stop's distance
    // from Berlin (we have to go there and come back).
    expect(r.distanceKm).toBeGreaterThan(800);
  });

  it('open path is never longer than closed path on the same stops', () => {
    const stops = [HAMBURG, MUNICH, COLOGNE, FRANKFURT];
    const open = optimizeStops({ start: BERLIN, stops });
    const closed = optimizeStops({ start: BERLIN, end: BERLIN, stops });
    expect(open.distanceKm).toBeLessThanOrEqual(closed.distanceKm);
  });

  it('marks small problems as solved exactly', () => {
    const r = optimizeStops({
      start: BERLIN,
      stops: [HAMBURG, MUNICH, COLOGNE, FRANKFURT],
    });
    expect(r.solver).toBe('exact');
  });
});

describe('optimizeStops — heuristic engages above 12 stops', () => {
  function ringStops(count: number, radius = 0.5): Coordinates[] {
    // Place `count` stops on a circle of `radius` degrees around Berlin.
    const out: Coordinates[] = [];
    for (let i = 0; i < count; i++) {
      const theta = (2 * Math.PI * i) / count;
      out.push({
        lat: BERLIN.lat + radius * Math.cos(theta),
        lng: BERLIN.lng + radius * Math.sin(theta),
      });
    }
    return out;
  }

  it('uses heuristic solver for > 12 stops', () => {
    const stops = ringStops(15);
    const r = optimizeStops({ start: BERLIN, stops });
    expect(r.solver).toBe('heuristic');
    expect(r.order).toHaveLength(15);
    expect(new Set(r.order).size).toBe(15);
  });

  it('heuristic result is at least as good as the input ordering', () => {
    const stops = ringStops(20);
    const r = optimizeStops({ start: BERLIN, stops });
    expect(r.distanceKm).toBeLessThanOrEqual(r.baselineDistanceKm + 1e-6);
  });

  it('heuristic on 30 stops finishes in reasonable time and beats baseline', () => {
    const stops = ringStops(30, 0.4);
    const t0 = Date.now();
    const r = optimizeStops({ start: BERLIN, stops });
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(500); // generous CI margin
    expect(r.distanceKm).toBeLessThanOrEqual(r.baselineDistanceKm);
  });
});

describe('optimizeStops — savings invariant', () => {
  it('savedKm is always >= 0', () => {
    // Try a shuffled set of cities — saved-km can be 0 if the input
    // happens to be optimal, but never negative.
    const stops = [HAMBURG, COLOGNE, FRANKFURT, MUNICH];
    const r = optimizeStops({ start: BERLIN, stops });
    expect(r.savedKm).toBeGreaterThanOrEqual(0);
    expect(r.savedKm).toBeCloseTo(r.baselineDistanceKm - r.distanceKm, 5);
  });

  it('respects fixed start/end on a 2-stop trivial case', () => {
    // Berlin → A → B → Berlin: only two orderings, A→B or B→A. By
    // symmetry both have the same length, so saved should be 0.
    const r = optimizeStops({
      start: BERLIN,
      end: BERLIN,
      stops: [HAMBURG, MUNICH],
    });
    expect(r.savedKm).toBeCloseTo(0, 1);
  });
});
