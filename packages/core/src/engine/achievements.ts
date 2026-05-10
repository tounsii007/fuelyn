// ============================================================
// Fuelyn — Achievements & gamification engine
//
// Pure derivation: given the user's fuel log + smart-buying
// score, derive a list of achievements they've earned. Each
// achievement is rendered the same way client-side; the engine
// just decides which ids the user has unlocked.
//
// Categories:
//   - Streak    (consecutive smart fills)
//   - Milestone (first fill, 10/50/100 fills, X € saved, etc.)
//   - CO2       (planted-tree equivalents)
//   - Time      (year-over-year, smart-time-of-day)
//   - Variety   (5 distinct stations / 3 brands / etc.)
//
// Achievements are ADDITIVE — once earned, always earned. We
// don't tie them to a "current week" so the user can see their
// trophy wall grow over months without losing badges to bad luck.
// ============================================================

import type { FuelLogEntry } from '../domain/types';
import { entryCo2Kg } from './co2-tracking';
import { computeSmartBuyingScore } from './smart-buying-score';
import type { PriceSnapshot } from './best-time-heatmap';

export type AchievementCategory = 'streak' | 'milestone' | 'co2' | 'time' | 'variety' | 'savings';

export interface Achievement {
  /** Stable identifier; UI maps to localised label/desc. */
  id: string;
  category: AchievementCategory;
  /** True when the user has earned it. */
  unlocked: boolean;
  /**
   * 0–1 progress towards unlock for locked achievements; 1.0
   * for unlocked ones. Drives the progress ring in the UI.
   */
  progress: number;
  /**
   * For threshold-based achievements: the user's current value.
   * `target` is the value at which it unlocks. Both omitted for
   * binary "did this once" achievements like firstFill.
   */
  current?: number;
  target?: number;
  /** ISO date the achievement was unlocked, or null when locked. */
  unlockedAt: string | null;
}

export interface AchievementsResult {
  /** All achievement records (locked + unlocked), in display order. */
  achievements: Achievement[];
  /** Number unlocked. */
  unlockedCount: number;
  /** Total possible — useful for the "X of Y" header. */
  totalCount: number;
  /** Sum of "points" — each unlocked achievement is 10 points. */
  points: number;
  /** Most recently-unlocked id (for the toast nudge). */
  latest: Achievement | null;
}

interface BinaryDef {
  id: string;
  category: AchievementCategory;
  predicate: (ctx: Ctx) => boolean;
  /** Optional date extractor for the unlockedAt field. */
  unlockedAtOf?: (ctx: Ctx) => string | null;
}

interface ThresholdDef {
  id: string;
  category: AchievementCategory;
  /** Current value (capped/raw). */
  current: (ctx: Ctx) => number;
  target: number;
  /** Optional date extractor — default: latest fill date. */
  unlockedAtOf?: (ctx: Ctx) => string | null;
}

interface Ctx {
  log: readonly FuelLogEntry[];
  market: readonly PriceSnapshot[];
  totalLiters: number;
  totalCo2Kg: number;
  totalSavedEur: number;
  smartFills: number;
  earliestDate: string | null;
  latestDate: string | null;
  distinctBrands: Set<string>;
  distinctStations: Set<string>;
  longestSmartStreak: number;
}

function buildCtx(log: readonly FuelLogEntry[], market: readonly PriceSnapshot[]): Ctx {
  let totalLiters = 0;
  let totalCo2 = 0;
  const brands = new Set<string>();
  const stations = new Set<string>();
  let earliest: string | null = null;
  let latest: string | null = null;

  // Sort by date ascending for streak calculation.
  const sorted = [...log].sort((a, b) => a.date.localeCompare(b.date));
  for (const e of sorted) {
    if (Number.isFinite(e.liters) && e.liters > 0) totalLiters += e.liters;
    totalCo2 += entryCo2Kg(e);
    if (e.stationBrand) brands.add(e.stationBrand.toLowerCase());
    if (e.stationName) stations.add(e.stationName.toLowerCase());
    if (!earliest || e.date < earliest) earliest = e.date;
    if (!latest || e.date > latest) latest = e.date;
  }

  // Smart-buying score gives us per-fill savings-classification
  // indirectly. We compute the streak by re-evaluating each fill
  // individually and counting consecutive "below market" runs.
  let smartFills = 0;
  let longestStreak = 0;
  let currentStreak = 0;
  for (const e of sorted) {
    const single = computeSmartBuyingScore({ log: [e], market });
    const beat = single.evaluatedFills > 0 && single.components.consistency === 1;
    if (beat) {
      smartFills++;
      currentStreak++;
      if (currentStreak > longestStreak) longestStreak = currentStreak;
    } else if (single.evaluatedFills > 0) {
      // Only break the streak when we actually had market context;
      // skipped fills don't count against the user.
      currentStreak = 0;
    }
  }

  // Total savings vs. market via the bulk score on the full log.
  const bulk = computeSmartBuyingScore({ log, market });
  const totalSavedEur = Math.max(0, bulk.totalEdgeEur);

  return {
    log,
    market,
    totalLiters: Math.round(totalLiters * 100) / 100,
    totalCo2Kg: Math.round(totalCo2 * 100) / 100,
    totalSavedEur,
    smartFills,
    earliestDate: earliest,
    latestDate: latest,
    distinctBrands: brands,
    distinctStations: stations,
    longestSmartStreak: longestStreak,
  };
}

const BINARY_DEFS: BinaryDef[] = [
  {
    id: 'first-fill',
    category: 'milestone',
    predicate: (c) => c.log.length >= 1,
    unlockedAtOf: (c) => c.earliestDate,
  },
  {
    id: 'smart-time-of-day',
    category: 'time',
    // At least one fill landed before 8am OR after 8pm — those
    // are the canonical "cheap window" hours.
    predicate: (c) =>
      c.log.some((e) => {
        const hr = new Date(e.date).getUTCHours();
        return hr < 8 || hr >= 20;
      }),
    unlockedAtOf: (c) => c.latestDate,
  },
];

const THRESHOLD_DEFS: ThresholdDef[] = [
  // Fill milestones
  { id: 'fills-10',  category: 'milestone', current: (c) => c.log.length, target: 10 },
  { id: 'fills-50',  category: 'milestone', current: (c) => c.log.length, target: 50 },
  { id: 'fills-100', category: 'milestone', current: (c) => c.log.length, target: 100 },
  // Liter milestones
  { id: 'liters-500',  category: 'milestone', current: (c) => c.totalLiters, target: 500 },
  { id: 'liters-2000', category: 'milestone', current: (c) => c.totalLiters, target: 2000 },
  // Smart streaks
  { id: 'streak-3',  category: 'streak', current: (c) => c.longestSmartStreak, target: 3 },
  { id: 'streak-7',  category: 'streak', current: (c) => c.longestSmartStreak, target: 7 },
  { id: 'streak-14', category: 'streak', current: (c) => c.longestSmartStreak, target: 14 },
  // Savings
  { id: 'saved-10',  category: 'savings', current: (c) => c.totalSavedEur, target: 10 },
  { id: 'saved-50',  category: 'savings', current: (c) => c.totalSavedEur, target: 50 },
  { id: 'saved-100', category: 'savings', current: (c) => c.totalSavedEur, target: 100 },
  { id: 'saved-500', category: 'savings', current: (c) => c.totalSavedEur, target: 500 },
  // CO2 (a tree absorbs ~22 kg/yr → planted-tree equivalents)
  { id: 'co2-220',  category: 'co2', current: (c) => c.totalCo2Kg, target: 220 },   // 10 trees
  { id: 'co2-1100', category: 'co2', current: (c) => c.totalCo2Kg, target: 1100 },  // 50 trees
  // Variety
  { id: 'brands-3', category: 'variety', current: (c) => c.distinctBrands.size, target: 3 },
  { id: 'stations-5',  category: 'variety', current: (c) => c.distinctStations.size, target: 5 },
  { id: 'stations-15', category: 'variety', current: (c) => c.distinctStations.size, target: 15 },
];

/**
 * Compute all achievements from the user's data.
 */
export function computeAchievements(
  log: readonly FuelLogEntry[],
  market: readonly PriceSnapshot[],
): AchievementsResult {
  const ctx = buildCtx(log, market);

  const out: Achievement[] = [];

  for (const def of BINARY_DEFS) {
    const unlocked = def.predicate(ctx);
    out.push({
      id: def.id,
      category: def.category,
      unlocked,
      progress: unlocked ? 1 : 0,
      unlockedAt: unlocked ? def.unlockedAtOf?.(ctx) ?? ctx.latestDate : null,
    });
  }

  for (const def of THRESHOLD_DEFS) {
    const cur = def.current(ctx);
    const unlocked = cur >= def.target;
    out.push({
      id: def.id,
      category: def.category,
      unlocked,
      progress: Math.min(1, cur / def.target),
      current: Math.round(cur * 100) / 100,
      target: def.target,
      unlockedAt: unlocked ? def.unlockedAtOf?.(ctx) ?? ctx.latestDate : null,
    });
  }

  // Sort: unlocked first (newest first), then locked by descending
  // progress so "almost unlocked" sit at top of the locked group.
  out.sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    if (a.unlocked && b.unlocked) {
      return (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? '');
    }
    return b.progress - a.progress;
  });

  const unlockedAchievements = out.filter((a) => a.unlocked);
  return {
    achievements: out,
    unlockedCount: unlockedAchievements.length,
    totalCount: out.length,
    points: unlockedAchievements.length * 10,
    latest: unlockedAchievements[0] ?? null,
  };
}
