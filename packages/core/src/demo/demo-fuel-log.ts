// ============================================================
// Demo-data generator (Iter AA — cold-start mitigation)
//
// Builds a realistic-looking fuel-log dataset that exercises every
// downstream feature (CO₂ dashboard, smart-buying score, best-time
// heatmap, achievements, saving tips, counterfactual, wrapped).
// New users tap "try with sample data" on the empty-state screen
// and immediately see the full app instead of empty cards.
//
// Pure / deterministic — accepts a `now` clock so the generated
// dates are stable in tests.
// ============================================================

import type { FuelLogEntry, FuelType } from '../domain/types';

const BRANDS = [
  { brand: 'Aral',   weight: 5 },
  { brand: 'Shell',  weight: 4 },
  { brand: 'Esso',   weight: 3 },
  { brand: 'Total',  weight: 2 },
  { brand: 'Jet',    weight: 2 },
  { brand: 'Star',   weight: 1 },
  { brand: 'HEM',    weight: 1 },
] as const;

const STREETS = [
  'Bahnhofstraße 12',
  'Hauptstraße 45',
  'Friedrich-Ebert-Allee 7',
  'Marienplatz 3',
  'Frankfurter Straße 88',
  'Bundesallee 200',
];

export interface DemoOptions {
  /** Reference clock — newest entry will be ~yesterday from this. */
  now?: Date;
  /** Number of fill-ups to generate. Default 14 (≈ a year of monthly fills). */
  count?: number;
  /** Default fuel type for the synthetic vehicle. */
  fuelType?: FuelType;
  /** Litres-per-100-km for the synthetic vehicle. */
  consumption?: number;
  /** Seed for the lcg — fixes randomness in tests. */
  seed?: number;
}

/**
 * Tiny deterministic LCG so we never pull in seedrandom. Produces
 * a stable sequence given the seed.
 */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function pickWeighted<T>(rng: () => number, items: ReadonlyArray<{ weight: number } & T>): T {
  const total = items.reduce((s, x) => s + x.weight, 0);
  let r = rng() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it;
  }
  return items[items.length - 1]!;
}

export function generateDemoFuelLog(opts: DemoOptions = {}): FuelLogEntry[] {
  const now = opts.now ?? new Date();
  const count = opts.count ?? 14;
  const fuelType: FuelType = opts.fuelType ?? 'e10';
  const consumption = opts.consumption ?? 6.5;
  const rng = lcg(opts.seed ?? 0xCAFEBABE);

  const out: FuelLogEntry[] = [];
  // Walk backwards from `now`, ~25 days between fills (so 14 fills ≈ a year).
  let cursor = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  for (let i = 0; i < count; i++) {
    const brand = pickWeighted(rng, BRANDS).brand;
    const street = STREETS[Math.floor(rng() * STREETS.length)]!;

    // Liters distribution: typical 35–55 L tank, occasional 25 L top-up.
    const liters =
      rng() < 0.15
        ? 22 + rng() * 8
        : 38 + rng() * 16;
    const litersR = Math.round(liters * 100) / 100;

    // Price oscillates around 1.74 €/L with a sinusoidal trend so the
    // heatmap + prediction get something interesting to show.
    const trendCycle = (i / count) * Math.PI * 2;
    const noise = (rng() - 0.5) * 0.06;
    const price = 1.74 + 0.07 * Math.sin(trendCycle) + noise;
    const priceR = Math.round(price * 1000) / 1000;
    const total = Math.round(litersR * priceR * 100) / 100;

    out.push({
      id: `demo-${i}`,
      date: cursor.toISOString(),
      stationName: `${brand} ${street}`,
      stationBrand: brand,
      fuelType,
      liters: litersR,
      pricePerLiter: priceR,
      totalCost: total,
      odometer: Math.round(15_000 + i * (consumption / 100) * (litersR * 100 / consumption)),
      note: i === 0 ? 'Demo-Eintrag — du kannst ihn jederzeit löschen.' : undefined,
    });

    // Advance the cursor 23–28 days back.
    cursor = new Date(cursor.getTime() - (23 + rng() * 5) * 24 * 60 * 60 * 1000);
  }

  // Newest first — matches the rest of the app's sort order.
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
