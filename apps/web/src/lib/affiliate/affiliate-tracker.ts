// ============================================================
// Affiliate tracker — Phase D (skeleton).
//
// Some brands (Aral Pulse, Shell Recharge, Total Energies) run
// affiliate / cashback programmes. When the user clicks "Navigate"
// or "Open in app" on one of those stations we want to:
//
//   1. Append the partner-supplied referral parameters to the
//      deeplink (no PII; just a partner-issued opaque ID).
//   2. Record the click locally so we can later attribute a
//      reward (without phoning home for the click itself —
//      the user may not consent to outbound tracking).
//   3. Optionally — when the user is logged in AND has opted
//      into reward syncing — sync the click record to the BFF.
//
// Privacy stance: the click record is opaque {brand, ts}. No
// station ID, no user ID, no location. The reward fulfilment
// is reconciled offline against partner statements.
// ============================================================

export type Brand = 'aral' | 'shell' | 'total' | 'esso' | 'jet' | 'star' | 'other';

interface AffiliatePartner {
  brand: Brand;
  /** Partner-issued referral ID. Loaded from env / settings, never hard-coded. */
  refId: string | null;
  /** Query-string param name the partner expects (e.g. `ref`, `partner`). */
  refParam: string;
  /** Brand-app deeplink scheme; null = no deeplink available. */
  appScheme: string | null;
}

const PARTNERS: Record<Brand, AffiliatePartner> = {
  aral:   { brand: 'aral',   refId: null, refParam: 'ref',     appScheme: null },
  shell:  { brand: 'shell',  refId: null, refParam: 'partner', appScheme: null },
  total:  { brand: 'total',  refId: null, refParam: 'ref',     appScheme: null },
  esso:   { brand: 'esso',   refId: null, refParam: 'ref',     appScheme: null },
  jet:    { brand: 'jet',    refId: null, refParam: 'ref',     appScheme: null },
  star:   { brand: 'star',   refId: null, refParam: 'ref',     appScheme: null },
  other:  { brand: 'other',  refId: null, refParam: 'ref',     appScheme: null },
};

const CLICK_LOG_KEY = 'fy:affiliate-clicks';
const MAX_LOG_ENTRIES = 500;

/** Best-effort brand inference from the station's brand field. */
export function inferBrand(stationBrand: string | undefined | null): Brand {
  if (!stationBrand) return 'other';
  const b = stationBrand.toLowerCase();
  if (b.includes('aral')) return 'aral';
  if (b.includes('shell')) return 'shell';
  if (b.includes('total')) return 'total';
  if (b.includes('esso')) return 'esso';
  if (/\bjet\b/.test(b)) return 'jet';
  if (/\bstar\b/.test(b)) return 'star';
  return 'other';
}

/**
 * Decorate an outbound URL with the partner's referral parameters.
 * No-op when no partner-id is configured — preserves the bare URL.
 */
export function decorateAffiliateUrl(brand: Brand, url: string): string {
  const partner = PARTNERS[brand];
  if (!partner.refId) return url;
  try {
    const u = new URL(url);
    u.searchParams.set(partner.refParam, partner.refId);
    return u.toString();
  } catch {
    return url; // not a valid URL, hand it back unchanged
  }
}

interface ClickRecord {
  brand: Brand;
  ts: number;
}

/**
 * Record an outbound click. Local-storage only; no network calls
 * unless the caller explicitly opts into BFF sync via a separate
 * helper.
 */
export function recordClick(brand: Brand): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(CLICK_LOG_KEY);
    const log: ClickRecord[] = raw ? JSON.parse(raw) : [];
    log.push({ brand, ts: Date.now() });
    // FIFO trim to keep the log bounded.
    const trimmed = log.length > MAX_LOG_ENTRIES
      ? log.slice(log.length - MAX_LOG_ENTRIES)
      : log;
    window.localStorage.setItem(CLICK_LOG_KEY, JSON.stringify(trimmed));
  } catch {
    // Quota exceeded / private mode — fail silently.
  }
}

/** Read the click log. Useful for the "Cashback Wallet" UI. */
export function readClicks(): ReadonlyArray<ClickRecord> {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CLICK_LOG_KEY);
    return raw ? (JSON.parse(raw) as ClickRecord[]) : [];
  } catch {
    return [];
  }
}
