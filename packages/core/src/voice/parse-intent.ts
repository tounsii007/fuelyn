// ============================================================
// Voice Intent Parser
// Pure, deterministic, locale-aware NLU for the in-app voice
// commands feature. Takes a transcript from the Web Speech API
// (or a typed command) and resolves it to a structured intent
// the UI router can dispatch on.
//
// We intentionally do NOT call out to an LLM here:
//   * the latency budget for a "tap the mic" UX is < 300 ms,
//   * the surface is narrow (find / navigate / log / settings),
//   * users want predictable behaviour ("the same words always
//     open the same screen").
// An LLM-backed fallback can wrap this for free-text fallthrough.
// ============================================================

import type { FuelType } from '../domain/types';
import { KNOWN_BRANDS } from '../config/constants';

// -----------------------------------------------------------------
// Intent vocabulary
// -----------------------------------------------------------------

export type VoiceIntentName =
  | 'find-cheapest' // "where is the cheapest e10"
  | 'navigate-to-station' // "navigate me to the nearest aral"
  | 'add-fuel-log' // "log 45 liters at 1.74"
  | 'show-fuel-log' // "show my fuel log"
  | 'show-stats' // "show price stats / dashboard"
  | 'show-achievements' // "show my trophies"
  | 'open-settings' // "open settings"
  | 'switch-fuel' // "switch to diesel"
  | 'set-radius' // "set radius to 8 km"
  | 'help' // "what can you do" / "help"
  | 'unknown';

/** Slot bag — every field is optional and intent-specific. */
export interface VoiceIntentSlots {
  /** Picked up by find-cheapest, navigate-to-station, switch-fuel. */
  fuel?: FuelType;
  /** Brand normalized to KNOWN_BRANDS (case-canonical). */
  brand?: string;
  /** Liters parsed for add-fuel-log. */
  liters?: number;
  /** €/L parsed for add-fuel-log. */
  pricePerLiter?: number;
  /** km parsed for set-radius. */
  radiusKm?: number;
}

export interface VoiceIntent {
  intent: VoiceIntentName;
  slots: VoiceIntentSlots;
  /** Confidence 0..1 — heuristic, used for the UI to decide auto-execute vs. confirm. */
  confidence: number;
  /** The normalized lower-case text we matched on. */
  utterance: string;
  /** The locale we treated the input as (de | en). */
  locale: 'de' | 'en';
}

export interface ParseIntentOptions {
  /** Hint locale; otherwise we sniff from the words. */
  locale?: 'de' | 'en';
  /** Optional list of known station brands; falls back to KNOWN_BRANDS. */
  brands?: readonly string[];
}

// -----------------------------------------------------------------
// Per-locale phrase tables
// -----------------------------------------------------------------

interface LocaleKeywords {
  /** Tokens that prove this is German. */
  language: readonly string[];
  fuel: Readonly<Record<FuelType, readonly string[]>>;
  intentVerbs: Readonly<Record<Exclude<VoiceIntentName, 'unknown'>, readonly string[]>>;
}

const DE: LocaleKeywords = {
  language: [
    'wo', 'wie', 'was', 'der', 'die', 'das', 'mein', 'meine',
    'günstig', 'günstigste', 'billig', 'billigste',
    'nächste', 'tanke', 'tanken', 'liter', 'tankstelle',
    'einstellungen', 'erfolge', 'statistik', 'verlauf',
    'navigiere', 'zeige', 'schalte', 'umkreis', 'radius',
    'hilfe', 'kannst',
  ],
  fuel: {
    e10: ['e10', 'super e10'],
    e5: ['e5', 'super e5', 'super', 'superbenzin', 'benzin'],
    diesel: ['diesel'],
  },
  intentVerbs: {
    'find-cheapest': [
      'günstigste', 'billigste', 'cheapest', 'wo ist der',
      'wo gibt es', 'finde den günstigsten', 'finde die günstigste',
    ],
    'navigate-to-station': [
      'navigiere', 'navigation', 'fahr mich', 'bring mich', 'route',
      'navigieren', 'losfahren',
    ],
    'add-fuel-log': [
      'logge', 'eintragen', 'trag ein', 'tank-log', 'tankvorgang',
      'getankt', 'liter eintragen', 'log',
    ],
    'show-fuel-log': [
      'zeige tank-log', 'tankverlauf', 'fuel log anzeigen', 'tank-historie',
      'logbuch',
    ],
    'show-stats': [
      'statistik', 'statistiken', 'dashboard', 'übersicht', 'preise zeigen',
    ],
    'show-achievements': [
      'erfolge', 'trophäen', 'achievements',
    ],
    'open-settings': [
      'einstellungen', 'settings', 'optionen',
    ],
    'switch-fuel': [
      'schalte um auf', 'wechsle zu', 'wechsle auf', 'standard',
    ],
    'set-radius': [
      'umkreis', 'radius', 'reichweite',
    ],
    help: [
      'hilfe', 'was kannst', 'was kannst du', 'kommandos',
    ],
  },
};

const EN: LocaleKeywords = {
  language: [
    'where', 'what', 'how', 'the', 'show', 'open', 'log',
    'cheapest', 'nearest', 'gas', 'station', 'liter', 'litre',
    'settings', 'achievements', 'stats', 'fuel',
    'navigate', 'switch', 'radius', 'help',
  ],
  fuel: {
    e10: ['e10', 'super e10'],
    e5: ['e5', 'super e5', 'gasoline', 'petrol', 'super'],
    diesel: ['diesel'],
  },
  intentVerbs: {
    'find-cheapest': [
      'cheapest', 'where is', 'find the cheapest', 'best deal',
      'lowest price',
    ],
    'navigate-to-station': [
      'navigate', 'directions to', 'take me to', 'drive to',
      'route to',
    ],
    'add-fuel-log': [
      'log', 'add fill-up', 'add fuel log', 'just filled', 'i filled',
      'add a fill', 'log fill',
    ],
    'show-fuel-log': [
      'show fuel log', 'show my log', 'fill-up history', 'fuel history',
    ],
    'show-stats': [
      'stats', 'dashboard', 'price overview', 'show prices',
    ],
    'show-achievements': [
      'achievements', 'trophies', 'awards',
    ],
    'open-settings': [
      'settings', 'preferences', 'options',
    ],
    'switch-fuel': [
      'switch to', 'change fuel to', 'set fuel to',
    ],
    'set-radius': [
      'radius', 'search radius', 'within',
    ],
    help: [
      'help', 'what can you do', 'commands',
    ],
  },
};

// -----------------------------------------------------------------
// Top-level parser
// -----------------------------------------------------------------

export function parseVoiceIntent(
  raw: string,
  opts: ParseIntentOptions = {},
): VoiceIntent {
  const utterance = normalize(raw);
  const locale = opts.locale ?? sniffLocale(utterance);
  const lex = locale === 'de' ? DE : EN;
  const brands = (opts.brands ?? KNOWN_BRANDS).map((b) => b.toLowerCase());

  if (!utterance) {
    return makeIntent('unknown', {}, 0, utterance, locale);
  }

  // Try each intent in priority order. The order matters when verbs
  // overlap (e.g. "log 40 liters" should beat "show log").
  const candidates: Array<() => VoiceIntent | null> = [
    () => tryAddFuelLog(utterance, lex, locale),
    () => trySetRadius(utterance, lex, locale),
    () => trySwitchFuel(utterance, lex, locale, brands),
    () => tryNavigateToStation(utterance, lex, locale, brands),
    () => tryFindCheapest(utterance, lex, locale),
    () => tryShowFuelLog(utterance, lex, locale),
    () => tryShowAchievements(utterance, lex, locale),
    () => tryShowStats(utterance, lex, locale),
    () => tryOpenSettings(utterance, lex, locale),
    () => tryHelp(utterance, lex, locale),
  ];

  for (const fn of candidates) {
    const hit = fn();
    if (hit) return hit;
  }

  return makeIntent('unknown', {}, 0.1, utterance, locale);
}

// -----------------------------------------------------------------
// Per-intent matchers
// -----------------------------------------------------------------

function tryFindCheapest(
  text: string,
  lex: LocaleKeywords,
  locale: 'de' | 'en',
): VoiceIntent | null {
  const verbs = lex.intentVerbs['find-cheapest'];
  if (!hasAny(text, verbs)) return null;
  return makeIntent('find-cheapest', { fuel: extractFuel(text, lex) }, 0.9, text, locale);
}

function tryNavigateToStation(
  text: string,
  lex: LocaleKeywords,
  locale: 'de' | 'en',
  brands: readonly string[],
): VoiceIntent | null {
  const verbs = lex.intentVerbs['navigate-to-station'];
  if (!hasAny(text, verbs)) return null;
  const brand = extractBrand(text, brands);
  const fuel = extractFuel(text, lex);
  const conf = brand ? 0.95 : 0.7;
  return makeIntent('navigate-to-station', { brand, fuel }, conf, text, locale);
}

function tryAddFuelLog(
  text: string,
  lex: LocaleKeywords,
  locale: 'de' | 'en',
): VoiceIntent | null {
  // We require AT LEAST a liter mention OR an explicit "log/eintragen" verb.
  const litersMatch = extractLiters(text);
  const hasVerb = hasAny(text, lex.intentVerbs['add-fuel-log']);
  if (!litersMatch && !hasVerb) return null;
  if (!litersMatch && hasVerb) {
    // "log fuel" with nothing parseable — still capture the intent so the
    // UI can open the form pre-focused.
    return makeIntent('add-fuel-log', { fuel: extractFuel(text, lex) }, 0.6, text, locale);
  }
  const price = extractPricePerLiter(text);
  const slots: VoiceIntentSlots = {
    fuel: extractFuel(text, lex),
    liters: litersMatch ?? undefined,
  };
  if (price != null) slots.pricePerLiter = price;
  return makeIntent('add-fuel-log', slots, hasVerb ? 0.95 : 0.8, text, locale);
}

function tryShowFuelLog(
  text: string,
  lex: LocaleKeywords,
  locale: 'de' | 'en',
): VoiceIntent | null {
  if (!hasAny(text, lex.intentVerbs['show-fuel-log'])) return null;
  return makeIntent('show-fuel-log', {}, 0.9, text, locale);
}

function tryShowStats(
  text: string,
  lex: LocaleKeywords,
  locale: 'de' | 'en',
): VoiceIntent | null {
  if (!hasAny(text, lex.intentVerbs['show-stats'])) return null;
  return makeIntent('show-stats', {}, 0.9, text, locale);
}

function tryShowAchievements(
  text: string,
  lex: LocaleKeywords,
  locale: 'de' | 'en',
): VoiceIntent | null {
  if (!hasAny(text, lex.intentVerbs['show-achievements'])) return null;
  return makeIntent('show-achievements', {}, 0.95, text, locale);
}

function tryOpenSettings(
  text: string,
  lex: LocaleKeywords,
  locale: 'de' | 'en',
): VoiceIntent | null {
  if (!hasAny(text, lex.intentVerbs['open-settings'])) return null;
  return makeIntent('open-settings', {}, 0.95, text, locale);
}

function trySwitchFuel(
  text: string,
  lex: LocaleKeywords,
  locale: 'de' | 'en',
  _brands: readonly string[],
): VoiceIntent | null {
  // "switch to diesel" / "schalte um auf e10"
  if (!hasAny(text, lex.intentVerbs['switch-fuel'])) return null;
  const fuel = extractFuel(text, lex);
  if (!fuel) return null;
  return makeIntent('switch-fuel', { fuel }, 0.95, text, locale);
}

function trySetRadius(
  text: string,
  lex: LocaleKeywords,
  locale: 'de' | 'en',
): VoiceIntent | null {
  const verbs = lex.intentVerbs['set-radius'];
  if (!hasAny(text, verbs)) return null;
  const km = extractRadius(text);
  if (km == null) return null;
  return makeIntent('set-radius', { radiusKm: km }, 0.95, text, locale);
}

function tryHelp(
  text: string,
  lex: LocaleKeywords,
  locale: 'de' | 'en',
): VoiceIntent | null {
  if (!hasAny(text, lex.intentVerbs.help)) return null;
  return makeIntent('help', {}, 0.95, text, locale);
}

// -----------------------------------------------------------------
// Slot extractors
// -----------------------------------------------------------------

function extractFuel(text: string, lex: LocaleKeywords): FuelType | undefined {
  // Order: e10 before e5 before diesel — longest first to avoid "super" matching e5
  // when the user said "super e10". hasAny operates on whole-token presence.
  const order: FuelType[] = ['e10', 'e5', 'diesel'];
  for (const f of order) {
    if (hasAny(text, lex.fuel[f])) return f;
  }
  return undefined;
}

function extractBrand(
  text: string,
  brands: readonly string[],
): string | undefined {
  for (const b of brands) {
    if (text.includes(b)) {
      // Preserve canonical casing from KNOWN_BRANDS (we lowercased it for matching).
      const canonical = KNOWN_BRANDS.find((x) => x.toLowerCase() === b);
      return canonical ?? b;
    }
  }
  return undefined;
}

/** "45 liter", "45 litre", "45 l", "45,5 liter". Returns null if absent. */
function extractLiters(text: string): number | null {
  const re = /(-?\d+(?:[.,]\d+)?)\s*(?:l(?:itres?|iter|iters)?)\b/i;
  const m = re.exec(text);
  if (!m) return null;
  const n = Number(m[1]!.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * "1,749 €", "1.74 eur", "zu 1,74", "for 1.74". Returns null if absent.
 * Strategy: scan for ALL number-like substrings, then accept the first one
 * that (a) lives next to a price marker (€/eur/euro/cent), (b) follows a
 * preposition like "zu/for/at/@", or (c) is the only candidate left in the
 * valid €/L range AFTER stripping liter mentions. This avoids matching the
 * "38,5" of "38,5 Liter ... zu 1,749 €/L".
 */
function extractPricePerLiter(text: string): number | null {
  // 1) Strongest: a number directly followed by a euro / eur / € / cent marker.
  const direct = /(\d{1,2}(?:[.,]\d{1,3})?)\s*(?:€|eur|euro|cent)\b/i.exec(text);
  if (direct) {
    const n = Number(direct[1]!.replace(',', '.'));
    if (Number.isFinite(n) && n >= 0.5 && n <= 3.99) return n;
  }

  // 2) Number preceded by a price preposition.
  const prep = /(?:\bzu\b|\bfor\b|\bat\b|@)\s*(\d{1,2}(?:[.,]\d{1,3})?)/i.exec(text);
  if (prep) {
    const n = Number(prep[1]!.replace(',', '.'));
    if (Number.isFinite(n) && n >= 0.5 && n <= 3.99) return n;
  }

  // 3) Last resort: scan all decimals, exclude any immediately followed by a
  //    liter token, pick the first one in valid €/L range.
  const all = Array.from(text.matchAll(/(\d{1,2}(?:[.,]\d{1,3})?)/g));
  for (const m of all) {
    const after = text.slice((m.index ?? 0) + m[0].length).trim();
    if (/^(?:l|liters?|litres?)\b/i.test(after)) continue;
    const n = Number(m[1]!.replace(',', '.'));
    if (Number.isFinite(n) && n >= 0.5 && n <= 3.99) return n;
  }
  return null;
}

/** "8 km", "8km", "radius 8". Returns null if absent. */
function extractRadius(text: string): number | null {
  const re = /(\d+(?:[.,]\d+)?)\s*km\b/i;
  const m = re.exec(text);
  if (m) {
    const n = Number(m[1]!.replace(',', '.'));
    if (Number.isFinite(n) && n > 0 && n <= 100) return n;
  }
  // "radius 8" / "umkreis 8"
  const re2 = /(?:radius|umkreis|reichweite)\s+(\d+(?:[.,]\d+)?)/i;
  const m2 = re2.exec(text);
  if (m2) {
    const n = Number(m2[1]!.replace(',', '.'));
    if (Number.isFinite(n) && n > 0 && n <= 100) return n;
  }
  return null;
}

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[!?¡¿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sniffLocale(text: string): 'de' | 'en' {
  // Score based on language-specific stop-words. Defaults to de for ties
  // (this is a German-first product).
  let de = 0;
  let en = 0;
  for (const w of DE.language) if (containsWord(text, w)) de++;
  for (const w of EN.language) if (containsWord(text, w)) en++;
  return en > de ? 'en' : 'de';
}

function hasAny(text: string, candidates: readonly string[]): boolean {
  return candidates.some((c) => (c.includes(' ') ? text.includes(c) : containsWord(text, c)));
}

function containsWord(text: string, word: string): boolean {
  // Whole-word match — avoids "super" matching inside "supermarket".
  const re = new RegExp(`(^|[^a-z0-9äöüß])${escapeRegex(word)}(?=$|[^a-z0-9äöüß])`, 'i');
  return re.test(text);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeIntent(
  intent: VoiceIntentName,
  slots: VoiceIntentSlots,
  confidence: number,
  utterance: string,
  locale: 'de' | 'en',
): VoiceIntent {
  return { intent, slots, confidence, utterance, locale };
}
