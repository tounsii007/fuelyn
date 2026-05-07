// ============================================================
// Geo-fence engine — pure functions deciding when an alert fires.
//
// Decoupled from React, the browser, and the store so it can be
// unit-tested deterministically. The watcher hook calls
// `evaluateFences` on every position update; the result is a list
// of `FenceEvent`s the UI then dispatches.
// ============================================================

import type { LatLng } from './distance';
import { isInsideCircle } from './distance';

/** A circular geo-fence around a target station with a price threshold. */
export interface GeoFence {
  readonly id: string;
  readonly label: string;
  readonly stationId: string;
  /** Brand or station name for nicer notification copy. */
  readonly stationName: string;
  readonly center: LatLng;
  /** Radius in km. */
  readonly radiusKm: number;
  /** Fuel type the user cares about. */
  readonly fuelType: 'diesel' | 'e5' | 'e10';
  /** Trigger when price ≤ this value (EUR/L). null = always trigger on entry. */
  readonly maxPrice: number | null;
  readonly enabled: boolean;
}

/** A station's current price snapshot (BFF or unified-stations response). */
export interface StationPriceSnapshot {
  readonly stationId: string;
  readonly stationName: string;
  readonly brand: string;
  readonly fuelType: 'diesel' | 'e5' | 'e10';
  readonly price: number;
  readonly lat: number;
  readonly lng: number;
}

/** State passed into the engine — the watcher keeps this between calls. */
export interface FenceEngineState {
  /** Last-known fence-id → (timestamp ms) cooldown so we don't spam. */
  readonly cooldown: ReadonlyMap<string, number>;
}

export interface FenceEvent {
  readonly fence: GeoFence;
  readonly station: StationPriceSnapshot;
  readonly title: string;
  readonly body: string;
  readonly distanceKm: number;
}

export interface EvaluationResult {
  readonly events: ReadonlyArray<FenceEvent>;
  readonly nextState: FenceEngineState;
}

export interface EvaluateOptions {
  /** Min ms between two events for the same fence (defaults to 30 minutes). */
  readonly cooldownMs?: number;
  /** Wall-clock timestamp to use; defaults to {@code Date.now()}. */
  readonly now?: number;
}

const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000;

/**
 * Evaluate which fences should fire at the given position.
 *
 * Algorithm:
 *   1. For each enabled fence, check user is inside the radius.
 *   2. Find the matching station snapshot by id.
 *   3. Verify the price is below the threshold.
 *   4. Skip if a recent event exists in the cooldown map.
 */
export function evaluateFences(
  position: LatLng,
  fences: ReadonlyArray<GeoFence>,
  prices: ReadonlyArray<StationPriceSnapshot>,
  state: FenceEngineState,
  options: EvaluateOptions = {},
): EvaluationResult {
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const now = options.now ?? Date.now();

  const priceById = new Map<string, StationPriceSnapshot>();
  for (const p of prices) priceById.set(p.stationId, p);

  const events: FenceEvent[] = [];
  const cooldown = new Map(state.cooldown);

  for (const fence of fences) {
    if (!fence.enabled) continue;

    const lastFired = cooldown.get(fence.id);
    if (lastFired != null && now - lastFired < cooldownMs) continue;

    if (!isInsideCircle(position, fence.center, fence.radiusKm)) continue;

    const station = priceById.get(fence.stationId);
    if (!station) continue;

    if (station.fuelType !== fence.fuelType) continue;

    if (fence.maxPrice != null && station.price > fence.maxPrice) continue;

    const distanceKm = approxDistance(position, fence.center);
    events.push({
      fence,
      station,
      distanceKm,
      title: buildTitle(fence, station),
      body: buildBody(fence, station, distanceKm),
    });
    cooldown.set(fence.id, now);
  }

  return { events, nextState: { cooldown } };
}

function approxDistance(a: LatLng, b: LatLng): number {
  const x = ((b.lng - a.lng) * Math.PI) / 180 * Math.cos(((a.lat + b.lat) / 2 * Math.PI) / 180);
  const y = ((b.lat - a.lat) * Math.PI) / 180;
  return Math.sqrt(x * x + y * y) * 6371.0088;
}

function buildTitle(fence: GeoFence, _snap: StationPriceSnapshot): string {
  return `${fence.stationName} um die Ecke`;
}

function buildBody(_fence: GeoFence, snap: StationPriceSnapshot, distanceKm: number): string {
  const priceStr = `${snap.price.toFixed(3).replace('.', ',')} €/L`;
  const distStr = distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`;
  return `${snap.fuelType.toUpperCase()} für ${priceStr} · ${distStr} entfernt`;
}

/** Type guard for serialised fence objects coming back from localStorage. */
export function isGeoFence(obj: unknown): obj is GeoFence {
  if (!obj || typeof obj !== 'object') return false;
  const f = obj as Record<string, unknown>;
  return (
    typeof f.id === 'string' &&
    typeof f.stationId === 'string' &&
    typeof f.radiusKm === 'number' &&
    f.center != null &&
    typeof (f.center as LatLng).lat === 'number' &&
    typeof (f.center as LatLng).lng === 'number'
  );
}
