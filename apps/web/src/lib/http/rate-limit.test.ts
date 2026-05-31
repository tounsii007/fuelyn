import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { createRateLimiter, getClientKey } from './rate-limit';

function fakeRequest(headers: Record<string, string>): NextRequest {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  } as unknown as NextRequest;
}

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests up to the limit', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });

    expect(limiter.check('ip1').limited).toBe(false);
    expect(limiter.check('ip1').limited).toBe(false);
    expect(limiter.check('ip1').limited).toBe(false);
  });

  it('blocks requests beyond the limit in the same window', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });

    limiter.check('ip1');
    limiter.check('ip1');
    const third = limiter.check('ip1');

    expect(third.limited).toBe(true);
    expect(third.remaining).toBe(0);
  });

  it('resets after the window elapses', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });

    expect(limiter.check('ip1').limited).toBe(false);
    expect(limiter.check('ip1').limited).toBe(true);

    vi.advanceTimersByTime(60_001);

    const afterWindow = limiter.check('ip1');
    expect(afterWindow.limited).toBe(false);
    expect(afterWindow.remaining).toBe(0); // max=1, so 0 remaining after first call
  });

  it('tracks keys independently', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });

    limiter.check('ip1');
    expect(limiter.check('ip2').limited).toBe(false);
  });

  it('reports correct remaining and resetAt', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 5 });

    const result = limiter.check('ip1');

    expect(result.remaining).toBe(4);
    expect(result.resetAt).toBe(Date.now() + 60_000);
  });
});

describe('getClientKey', () => {
  const originalEnv = process.env.RATE_LIMIT_TRUST_PROXY;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.RATE_LIMIT_TRUST_PROXY;
    } else {
      process.env.RATE_LIMIT_TRUST_PROXY = originalEnv;
    }
  });

  it('returns "direct" when proxy trust is disabled', () => {
    delete process.env.RATE_LIMIT_TRUST_PROXY;

    const req = fakeRequest({ 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8' });

    expect(getClientKey(req)).toBe('direct');
  });

  it('uses the RIGHTMOST x-forwarded-for hop (anti-spoof) when proxy trust is enabled', () => {
    process.env.RATE_LIMIT_TRUST_PROXY = '1';

    // "1.2.3.4" is the client-supplied (spoofable) leftmost value; "10.0.0.1"
    // is what our trusted proxy appended = the real peer. We must use the
    // latter, otherwise a client can forge its rate-limit identity.
    const req = fakeRequest({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' });

    expect(getClientKey(req)).toBe('10.0.0.1');
  });

  it('falls back to x-real-ip when x-forwarded-for is missing', () => {
    process.env.RATE_LIMIT_TRUST_PROXY = '1';

    const req = fakeRequest({ 'x-real-ip': '5.6.7.8' });

    expect(getClientKey(req)).toBe('5.6.7.8');
  });

  it('falls back to "direct" when no IP headers are present (trusted mode)', () => {
    process.env.RATE_LIMIT_TRUST_PROXY = '1';

    expect(getClientKey(fakeRequest({}))).toBe('direct');
  });

  it('does NOT trust proxy when value is "0"', () => {
    process.env.RATE_LIMIT_TRUST_PROXY = '0';

    const req = fakeRequest({ 'x-forwarded-for': '1.2.3.4' });

    expect(getClientKey(req)).toBe('direct');
  });
});
