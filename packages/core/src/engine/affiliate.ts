// ============================================================
// Affiliate-link injection
//
// Several outbound CTAs (carbon-offset providers, partner
// stations) can carry an affiliate parameter so we can be
// tracked back when the user converts. Codes live in env vars
// (FUELYN_AFFILIATE_*); this module is the pure mapping layer
// that injects the right param name + value into a URL without
// stomping on user-supplied query.
// ============================================================

export interface AffiliateConfig {
  /** Map of partner id → { paramName, paramValue }. */
  codes: Readonly<Record<string, { param: string; value: string } | undefined>>;
}

const NOOP: AffiliateConfig = { codes: {} };

/**
 * Append affiliate params to `url` for a given `partnerId`. Any
 * existing parameters on the URL are preserved untouched. Returns
 * the original URL if the partner has no configured code.
 *
 * Idempotent: running it twice is harmless (URLSearchParams .set
 * overwrites duplicates, so we never end up with double-codes).
 */
export function withAffiliate(url: string, partnerId: string, config: AffiliateConfig = NOOP): string {
  const code = config.codes[partnerId];
  if (!code) return url;
  try {
    const u = new URL(url);
    u.searchParams.set(code.param, code.value);
    return u.toString();
  } catch {
    // Bad URL — return verbatim rather than throwing.
    return url;
  }
}

/**
 * Build an AffiliateConfig from an env-style flat record. Variables
 * follow the convention FUELYN_AFFILIATE_<PARTNERID>=PARAM=VALUE.
 *
 *   FUELYN_AFFILIATE_ATMOSFAIR=ref=fuelyn
 *   FUELYN_AFFILIATE_PRIMAKLIMA=partner=fuelyn-de
 */
export function parseAffiliateEnv(env: Record<string, string | undefined>): AffiliateConfig {
  const codes: Record<string, { param: string; value: string } | undefined> = {};
  for (const [key, raw] of Object.entries(env)) {
    if (!key.startsWith('FUELYN_AFFILIATE_') || !raw) continue;
    const partnerId = key.slice('FUELYN_AFFILIATE_'.length).toLowerCase();
    const eq = raw.indexOf('=');
    if (eq <= 0) continue;
    const param = raw.slice(0, eq);
    const value = raw.slice(eq + 1);
    if (!param || !value) continue;
    codes[partnerId] = { param, value };
  }
  return { codes };
}
