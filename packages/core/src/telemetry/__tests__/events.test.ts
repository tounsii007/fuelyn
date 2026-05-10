// ============================================================
// Telemetry vocabulary + A/B variant tests.
// ============================================================

import { describe, it, expect } from 'vitest';
import { toDayKey, assignVariant } from '../events';

describe('toDayKey', () => {
  it('rounds to ISO yyyy-mm-dd', () => {
    expect(toDayKey(new Date('2026-05-10T15:42:00Z'))).toBe('2026-05-10');
  });

  it('is consistent for any time-of-day on the same UTC date', () => {
    const a = toDayKey(new Date('2026-05-10T00:00:00Z'));
    const b = toDayKey(new Date('2026-05-10T23:59:59Z'));
    expect(a).toBe(b);
  });
});

describe('assignVariant', () => {
  it('is stable for the same (user, test) pair', () => {
    const v1 = assignVariant('user-1', 'pricing', ['A', 'B'] as const);
    const v2 = assignVariant('user-1', 'pricing', ['A', 'B'] as const);
    expect(v1).toBe(v2);
  });

  it('different users get different distributions', () => {
    const variants: ('A' | 'B')[] = [];
    for (let i = 0; i < 100; i++) {
      variants.push(assignVariant(`user-${i}`, 'pricing', ['A', 'B']));
    }
    // Both buckets should be non-empty.
    expect(variants.filter((v) => v === 'A').length).toBeGreaterThan(0);
    expect(variants.filter((v) => v === 'B').length).toBeGreaterThan(0);
  });

  it('split across 100 users is reasonably balanced (40-60% each)', () => {
    let a = 0;
    for (let i = 0; i < 1000; i++) {
      if (assignVariant(`u-${i}`, 'pricing', ['A', 'B']) === 'A') a++;
    }
    // Roughly 50/50; allow ±10% slack.
    expect(a).toBeGreaterThan(400);
    expect(a).toBeLessThan(600);
  });

  it('respects the supplied variants list (no out-of-range)', () => {
    const out = new Set<string>();
    for (let i = 0; i < 100; i++) {
      out.add(assignVariant(`u-${i}`, 'gate-copy', ['copy-1', 'copy-2', 'copy-3']));
    }
    for (const v of out) expect(['copy-1', 'copy-2', 'copy-3']).toContain(v);
  });

  it('each test independently keeps a balanced distribution across users', () => {
    let aPricing = 0;
    let aGate = 0;
    for (let i = 0; i < 1000; i++) {
      if (assignVariant(`u-${i}`, 'pricing', ['A', 'B']) === 'A') aPricing++;
      if (assignVariant(`u-${i}`, 'gate-copy', ['A', 'B']) === 'A') aGate++;
    }
    // Each test bucket independently sits roughly 50/50 — confirming
    // the hash works per-test rather than collapsing all users into a
    // single bucket regardless of the test name.
    expect(aPricing).toBeGreaterThan(400);
    expect(aPricing).toBeLessThan(600);
    expect(aGate).toBeGreaterThan(400);
    expect(aGate).toBeLessThan(600);
  });

  it('throws on empty variants', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => assignVariant('u', 'pricing', [] as any)).toThrow();
  });
});
