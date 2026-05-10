// ============================================================
// Affiliate-link injection tests.
// ============================================================

import { describe, it, expect } from 'vitest';
import { withAffiliate, parseAffiliateEnv } from '../affiliate';

describe('withAffiliate', () => {
  it('returns the URL untouched when no code is configured', () => {
    expect(withAffiliate('https://x.com/buy', 'unknown')).toBe('https://x.com/buy');
  });

  it('appends the configured param + value', () => {
    const cfg = { codes: { atmosfair: { param: 'ref', value: 'fuelyn' } } };
    const out = withAffiliate('https://atmosfair.de/buy', 'atmosfair', cfg);
    expect(out).toBe('https://atmosfair.de/buy?ref=fuelyn');
  });

  it('preserves existing query parameters', () => {
    const cfg = { codes: { x: { param: 'ref', value: 'fy' } } };
    const out = withAffiliate('https://x.com/?utm=foo&campaign=bar', 'x', cfg);
    expect(out).toContain('utm=foo');
    expect(out).toContain('campaign=bar');
    expect(out).toContain('ref=fy');
  });

  it('is idempotent — applying twice doesnt double-up', () => {
    const cfg = { codes: { x: { param: 'ref', value: 'fy' } } };
    const once = withAffiliate('https://x.com/', 'x', cfg);
    const twice = withAffiliate(once, 'x', cfg);
    expect(twice).toBe(once);
  });

  it('returns the URL verbatim when input is malformed', () => {
    expect(withAffiliate('not a url', 'atmosfair', {
      codes: { atmosfair: { param: 'ref', value: 'fuelyn' } },
    })).toBe('not a url');
  });
});

describe('parseAffiliateEnv', () => {
  it('parses FUELYN_AFFILIATE_* keys correctly', () => {
    const env = {
      FUELYN_AFFILIATE_ATMOSFAIR: 'ref=fuelyn',
      FUELYN_AFFILIATE_PRIMAKLIMA: 'partner=fuelyn-de',
      OTHER: 'ignored',
    };
    const cfg = parseAffiliateEnv(env);
    expect(cfg.codes.atmosfair).toEqual({ param: 'ref', value: 'fuelyn' });
    expect(cfg.codes.primaklima).toEqual({ param: 'partner', value: 'fuelyn-de' });
  });

  it('skips malformed entries (no equals sign)', () => {
    const cfg = parseAffiliateEnv({ FUELYN_AFFILIATE_BAD: 'no-equal-sign' });
    expect(cfg.codes.bad).toBeUndefined();
  });

  it('skips empty values', () => {
    const cfg = parseAffiliateEnv({ FUELYN_AFFILIATE_X: 'ref=' });
    expect(cfg.codes.x).toBeUndefined();
  });

  it('lowercases partner ids for stable lookup', () => {
    const cfg = parseAffiliateEnv({ FUELYN_AFFILIATE_AtMoSfAiR: 'ref=fuelyn' });
    expect(cfg.codes.atmosfair).toBeDefined();
  });
});
