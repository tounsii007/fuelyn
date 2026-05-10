// ============================================================
// Carbon-Offset Marketplace
//
// Given the user's CO₂ footprint (from the fuel-log, see
// engine/co2-tracking.ts), surface a small curated catalogue of
// certified offset providers and compute the total cost of
// neutralising the user's emissions through each.
//
// We do NOT process payments here — that lives in the BFF /
// premium-gated checkout flow. This module is concerned only
// with the deterministic part: catalogue + math.
//
// Pricing snapshot taken Spring 2026 from each provider's public
// rate sheet. Numbers ARE estimates and subject to change; the
// catalogue includes a `lastReviewed` ISO date for honesty.
// ============================================================

// -----------------------------------------------------------------
// Catalogue
// -----------------------------------------------------------------

export type OffsetProjectType =
  | 'reforestation'      // tree-planting, e.g. PrimaKlima
  | 'forestry-protection' // REDD+, e.g. atmosfair-Brasilien
  | 'biogas'              // small biogas digesters in developing countries
  | 'cookstoves'          // efficient cookstoves replacing open fires
  | 'wind-solar'          // grid renewables credits
  | 'direct-air-capture'; // Climeworks-style DAC (most expensive, highest permanence)

export type OffsetCertification =
  | 'gold-standard'
  | 'vcs'   // Verra
  | 'cdm'   // UN Clean Development Mechanism
  | 'ccb'   // Climate, Community & Biodiversity
  | 'puro'; // CO₂ removal registry (DAC)

export interface OffsetProvider {
  id: string;
  name: string;
  countryCode: string; // home country (DE/CH/CH/IS …)
  projectType: OffsetProjectType;
  certification: OffsetCertification;
  /** EUR per metric ton (1000 kg) of CO₂. */
  eurPerTon: number;
  /** Marketing site / direct purchase URL. */
  url: string;
  /** ISO date when the rate was last reviewed. */
  lastReviewed: string;
  /** Short German description for the UI. */
  descDe: string;
}

/**
 * Curated offset catalogue. Kept intentionally small — UX is "pick
 * one, tap purchase", not "scroll 200 providers". Mix of project
 * types so users with different priorities (reforestation vs DAC)
 * have a sensible default.
 */
export const OFFSET_PROVIDERS: readonly OffsetProvider[] = [
  {
    id: 'atmosfair',
    name: 'atmosfair',
    countryCode: 'DE',
    projectType: 'cookstoves',
    certification: 'gold-standard',
    eurPerTon: 23,
    url: 'https://www.atmosfair.de/de/kompensieren/',
    lastReviewed: '2026-03-01',
    descDe: 'Effiziente Kochherde in Indien · Gold Standard.',
  },
  {
    id: 'primaklima',
    name: 'PrimaKlima',
    countryCode: 'DE',
    projectType: 'reforestation',
    certification: 'gold-standard',
    eurPerTon: 18,
    url: 'https://www.primaklima.org/spenden/',
    lastReviewed: '2026-03-01',
    descDe: 'Aufforstung weltweit · Gold Standard.',
  },
  {
    id: 'klima-kollekte',
    name: 'Klima-Kollekte',
    countryCode: 'DE',
    projectType: 'biogas',
    certification: 'gold-standard',
    eurPerTon: 25,
    url: 'https://klima-kollekte.de/spenden/',
    lastReviewed: '2026-03-01',
    descDe: 'Biogas-Anlagen in Entwicklungsländern · Gold Standard.',
  },
  {
    id: 'myclimate',
    name: 'myclimate',
    countryCode: 'CH',
    projectType: 'wind-solar',
    certification: 'gold-standard',
    eurPerTon: 30,
    url: 'https://co2.myclimate.org/de/',
    lastReviewed: '2026-03-01',
    descDe: 'Wind- & Solarprojekte in Asien · Gold Standard.',
  },
  {
    id: 'climeworks',
    name: 'Climeworks',
    countryCode: 'CH',
    projectType: 'direct-air-capture',
    certification: 'puro',
    eurPerTon: 850,
    url: 'https://climeworks.com/subscriptions',
    lastReviewed: '2026-03-01',
    descDe: 'Direct Air Capture in Island · permanente Speicherung.',
  },
  {
    id: 'verra-redd',
    name: 'Verra REDD+',
    countryCode: 'US',
    projectType: 'forestry-protection',
    certification: 'vcs',
    eurPerTon: 14,
    url: 'https://verra.org/programs/verified-carbon-standard/',
    lastReviewed: '2026-03-01',
    descDe: 'Schutz bestehender Wälder · VCS-Zertifizierung.',
  },
];

// -----------------------------------------------------------------
// Engine
// -----------------------------------------------------------------

export interface OffsetOption {
  provider: OffsetProvider;
  /** kg of CO₂ to be offset (matches input). */
  kg: number;
  /** Total price in EUR for that quantity. */
  totalEur: number;
}

export interface OffsetRecommendation {
  /** Sorted by ascending total cost — cheapest first. */
  cheapest: OffsetOption;
  /** Highest-permanence option (DAC if available, else certified forestry). */
  highestPermanence: OffsetOption;
  /** Full sorted list. */
  all: readonly OffsetOption[];
}

/**
 * Compute the cost-per-provider to offset a given CO₂ amount.
 * Returns recommendations sorted by total cost; cheapest + highest-
 * permanence picks are surfaced for one-tap UX.
 */
export function recommendOffsets(
  co2Kg: number,
  catalogue: readonly OffsetProvider[] = OFFSET_PROVIDERS,
): OffsetRecommendation | null {
  if (!Number.isFinite(co2Kg) || co2Kg <= 0) return null;
  if (catalogue.length === 0) return null;

  const tons = co2Kg / 1000;
  const all: OffsetOption[] = catalogue
    .map((p) => ({
      provider: p,
      kg: co2Kg,
      totalEur: round(p.eurPerTon * tons, 2),
    }))
    .sort((a, b) => a.totalEur - b.totalEur);

  // "Highest permanence" priority: DAC > forestry-protection > reforestation > others.
  const permanenceRank: Record<OffsetProjectType, number> = {
    'direct-air-capture': 5,
    'forestry-protection': 4,
    'reforestation': 3,
    'biogas': 2,
    'cookstoves': 1,
    'wind-solar': 1,
  };
  const highestPermanence = [...all].sort((a, b) => {
    const rd = permanenceRank[b.provider.projectType] - permanenceRank[a.provider.projectType];
    if (rd !== 0) return rd;
    return a.totalEur - b.totalEur; // tiebreaker: cheapest of equal permanence
  })[0]!;

  return {
    cheapest: all[0]!,
    highestPermanence,
    all,
  };
}

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
