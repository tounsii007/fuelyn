import { describe, expect, it } from 'vitest';
import { evaluateFences, type GeoFence, type StationPriceSnapshot } from './fence';

const BERLIN = { lat: 52.52, lng: 13.405 };

const fence = (overrides: Partial<GeoFence> = {}): GeoFence => ({
  id: overrides.id ?? 'f1',
  label: 'Aral Mitte',
  stationId: overrides.stationId ?? 's1',
  stationName: 'Aral Mitte',
  center: overrides.center ?? BERLIN,
  radiusKm: overrides.radiusKm ?? 1,
  fuelType: overrides.fuelType ?? 'e10',
  // distinguish "explicitly null" from "not provided"
  maxPrice: 'maxPrice' in overrides ? (overrides.maxPrice as number | null) : 1.75,
  enabled: overrides.enabled ?? true,
});

const snap = (overrides: Partial<StationPriceSnapshot> = {}): StationPriceSnapshot => ({
  stationId: overrides.stationId ?? 's1',
  stationName: 'Aral Mitte',
  brand: 'Aral',
  fuelType: overrides.fuelType ?? 'e10',
  price: overrides.price ?? 1.69,
  lat: BERLIN.lat,
  lng: BERLIN.lng,
});

describe('evaluateFences', () => {
  it('fires when user is inside fence and price is below threshold', () => {
    const result = evaluateFences(BERLIN, [fence()], [snap()], { cooldown: new Map() });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.fence.id).toBe('f1');
    expect(result.events[0]?.title).toContain('Aral Mitte');
  });

  it('does NOT fire when user is outside fence', () => {
    // 5 km north of Berlin → outside a 1 km fence
    const far = { lat: BERLIN.lat + 0.045, lng: BERLIN.lng };
    const result = evaluateFences(far, [fence()], [snap()], { cooldown: new Map() });
    expect(result.events).toHaveLength(0);
  });

  it('does NOT fire when price exceeds threshold', () => {
    const result = evaluateFences(
      BERLIN,
      [fence({ maxPrice: 1.6 })],
      [snap({ price: 1.79 })],
      { cooldown: new Map() },
    );
    expect(result.events).toHaveLength(0);
  });

  it('fires regardless of price when maxPrice is null', () => {
    const result = evaluateFences(
      BERLIN,
      [fence({ maxPrice: null })],
      [snap({ price: 9.99 })],
      { cooldown: new Map() },
    );
    expect(result.events).toHaveLength(1);
  });

  it('respects cooldown window', () => {
    const cooldown = new Map<string, number>([['f1', Date.now() - 60_000]]); // 1 min ago
    const result = evaluateFences(
      BERLIN,
      [fence()],
      [snap()],
      { cooldown },
      { cooldownMs: 30 * 60 * 1000 },
    );
    expect(result.events).toHaveLength(0);
  });

  it('clears cooldown after window has passed', () => {
    const cooldown = new Map<string, number>([['f1', Date.now() - 60 * 60 * 1000]]); // 1 hour ago
    const result = evaluateFences(
      BERLIN,
      [fence()],
      [snap()],
      { cooldown },
      { cooldownMs: 30 * 60 * 1000 },
    );
    expect(result.events).toHaveLength(1);
  });

  it('skips disabled fences', () => {
    const result = evaluateFences(
      BERLIN,
      [fence({ enabled: false })],
      [snap()],
      { cooldown: new Map() },
    );
    expect(result.events).toHaveLength(0);
  });

  it('matches fuelType strictly', () => {
    const result = evaluateFences(
      BERLIN,
      [fence({ fuelType: 'diesel' })],
      [snap({ fuelType: 'e10' })],
      { cooldown: new Map() },
    );
    expect(result.events).toHaveLength(0);
  });

  it('returns next state with updated cooldown timestamps', () => {
    const result = evaluateFences(
      BERLIN,
      [fence()],
      [snap()],
      { cooldown: new Map() },
      { now: 12345 },
    );
    expect(result.nextState.cooldown.get('f1')).toBe(12345);
  });

  it('handles multiple fences in one position update', () => {
    const fences = [fence({ id: 'f1' }), fence({ id: 'f2', stationId: 's2' })];
    const snapshots = [snap({ stationId: 's1' }), snap({ stationId: 's2' })];
    const result = evaluateFences(BERLIN, fences, snapshots, { cooldown: new Map() });
    expect(result.events).toHaveLength(2);
  });

  it('produces a body with km when far enough, m when close', () => {
    // Same point — 0 km → meters
    const r = evaluateFences(BERLIN, [fence()], [snap()], { cooldown: new Map() });
    expect(r.events[0]?.body).toMatch(/m entfernt/);
  });
});
