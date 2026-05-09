// ============================================================
// Achievements — pure-function definitions evaluated against
// the user's locally-tracked stats.
//
// Phase 9. The list is intentionally small (8 badges) — adding
// dozens of trivial milestones dilutes the moments that matter.
// Each badge has:
//   • a stable id for storage / persistence
//   • a tier ('bronze' | 'silver' | 'gold')
//   • a goal (numeric threshold) and a unit
//   • an evaluate() lambda that takes the stats object and returns
//     { earned, progress: 0..1 }
//
// We deliberately do NOT store "earned at" timestamps yet — the
// stats live in the existing app-store and are derived live, so
// re-renders pick up newly earned badges automatically.
// ============================================================

export type AchievementTier = 'bronze' | 'silver' | 'gold';

export interface AchievementStats {
  /** Distinct stations the user has clicked at least once. */
  readonly stationsExplored: number;
  /** Total cents saved (cumulative ⌀-baseline → cheapest visited). */
  readonly centsSaved: number;
  /** Number of price reports submitted by this device. */
  readonly reportsSubmitted: number;
  /** Days in a row with at least one price check. */
  readonly streakDays: number;
  /** Number of refuels logged in the Tank-Logbuch. */
  readonly refuelsLogged: number;
  /** Number of distinct fuel types the user has checked. */
  readonly fuelTypesUsed: number;
}

export interface Achievement {
  readonly id: string;
  readonly tier: AchievementTier;
  readonly title: string;
  readonly description: string;
  readonly icon: string; // emoji or single short label, kept simple
  readonly goal: number;
  readonly unit: 'stations' | 'cents' | 'reports' | 'days' | 'refuels' | 'fuelTypes';
  evaluate(stats: AchievementStats): { earned: boolean; progress: number; current: number };
}

const mk = (
  id: string,
  tier: AchievementTier,
  title: string,
  description: string,
  icon: string,
  goal: number,
  unit: Achievement['unit'],
  read: (s: AchievementStats) => number,
): Achievement => ({
  id, tier, title, description, icon, goal, unit,
  evaluate(s) {
    const current = read(s);
    return {
      earned: current >= goal,
      progress: Math.max(0, Math.min(1, current / goal)),
      current,
    };
  },
});

export const ACHIEVEMENTS: ReadonlyArray<Achievement> = [
  // ─── Stations explored ───────────────────────────────────────
  mk('explorer-bronze', 'bronze', 'Stadtbummler',     '10 Tankstellen geöffnet',  '🗺',   10,   'stations',  (s) => s.stationsExplored),
  mk('explorer-silver', 'silver', 'Bundesweit',       '50 Tankstellen geöffnet',  '🗺',   50,   'stations',  (s) => s.stationsExplored),
  mk('explorer-gold',   'gold',   'Spurensucher',     '200 Tankstellen geöffnet', '🗺',   200,  'stations',  (s) => s.stationsExplored),

  // ─── Cents saved (cumulative) ───────────────────────────────
  mk('saver-bronze', 'bronze', 'Sparfuchs',  '5 € insgesamt gespart',  '💰',  500,  'cents', (s) => s.centsSaved),
  mk('saver-silver', 'silver', 'Tank-Stratege', '50 € insgesamt gespart', '💰', 5000, 'cents', (s) => s.centsSaved),
  mk('saver-gold',   'gold',   'Sparkönig',  '250 € insgesamt gespart', '💰', 25000, 'cents', (s) => s.centsSaved),

  // ─── Reports / community contribution ───────────────────────
  mk('reporter-bronze', 'bronze', 'Korrektur-Held', '3 Preise gemeldet', '🛡', 3, 'reports', (s) => s.reportsSubmitted),
  mk('reporter-gold',   'gold',   'Crowd-Champion', '20 Preise gemeldet', '🛡', 20, 'reports', (s) => s.reportsSubmitted),

  // ─── Streak ─────────────────────────────────────────────────
  mk('streak-bronze', 'bronze', 'Tägliche Routine', '3 Tage in Folge', '🔥', 3, 'days', (s) => s.streakDays),
  mk('streak-gold',   'gold',   'Eiserne Routine', '30 Tage in Folge', '🔥', 30, 'days', (s) => s.streakDays),

  // ─── Logbook ────────────────────────────────────────────────
  mk('logger-bronze', 'bronze', 'Logbuch-Anfänger', '5 Tankvorgänge geloggt',  '📔',  5, 'refuels', (s) => s.refuelsLogged),
  mk('logger-silver', 'silver', 'Logbuch-Profi',    '25 Tankvorgänge geloggt', '📔', 25, 'refuels', (s) => s.refuelsLogged),

  // ─── Multi-fuel ─────────────────────────────────────────────
  mk('multi-fuel', 'silver', 'Treibstoff-Kenner', 'Diesel + E5 + E10 geprüft', '⛽', 3, 'fuelTypes', (s) => s.fuelTypesUsed),
];
