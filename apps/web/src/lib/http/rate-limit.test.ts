import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import type { RateLimitRedis } from '@/lib/redis/client';
import {
  createRateLimiter,
  getClientKey,
  MemoryRateLimitStore,
  RedisRateLimitStore,
} from './rate-limit';

function fakeRequest(headers: Record<string, string>): NextRequest {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  } as unknown as NextRequest;
}

// A fake Redis whose EVAL reproduces the limiter's fixed-window Lua:
// INCR the key, set the TTL on the first hit, return [count, ttlMs].
function makeFakeRedis(): RateLimitRedis {
  const store = new Map<string, { count: number; expireAt: number }>();
  return {
    async eval(_script: string, _numKeys: number, ...args: (string | number)[]): Promise<unknown> {
      const key = String(args[0]);
      const windowMs = Number(args[1]);
      const now = Date.now();
      const entry = store.get(key);
      if (!entry || now > entry.expireAt) {
        store.set(key, { count: 1, expireAt: now + windowMs });
        return [1, windowMs];
      }
      entry.count += 1;
      return [entry.count, entry.expireAt - now];
    },
  };
}

describe('createRateLimiter (in-memory default)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests up to the limit', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });

    expect((await limiter.check('ip1')).limited).toBe(false);
    expect((await limiter.check('ip1')).limited).toBe(false);
    expect((await limiter.check('ip1')).limited).toBe(false);
  });

  it('blocks requests beyond the limit in the same window', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });

    await limiter.check('ip1');
    await limiter.check('ip1');
    const third = await limiter.check('ip1');

    expect(third.limited).toBe(true);
    expect(third.remaining).toBe(0);
  });

  it('resets after the window elapses', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });

    expect((await limiter.check('ip1')).limited).toBe(false);
    expect((await limiter.check('ip1')).limited).toBe(true);

    vi.advanceTimersByTime(60_001);

    const afterWindow = await limiter.check('ip1');
    expect(afterWindow.limited).toBe(false);
    expect(afterWindow.remaining).toBe(0); // max=1, so 0 remaining after first call
  });

  it('tracks keys independently', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });

    await limiter.check('ip1');
    expect((await limiter.check('ip2')).limited).toBe(false);
  });

  it('reports correct remaining and resetAt', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 5 });

    const result = await limiter.check('ip1');

    expect(result.remaining).toBe(4);
    expect(result.resetAt).toBe(Date.now() + 60_000);
  });

  it('gives separately-created limiters independent in-memory stores', async () => {
    const a = createRateLimiter({ windowMs: 60_000, max: 1 });
    const b = createRateLimiter({ windowMs: 60_000, max: 1 });

    expect((await a.check('shared-key')).limited).toBe(false);
    // Different limiter, same key — must not inherit a's count.
    expect((await b.check('shared-key')).limited).toBe(false);
  });
});

describe('RedisRateLimitStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts hits through the shared store and limits beyond max', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 }, new RedisRateLimitStore(makeFakeRedis()));

    expect((await limiter.check('ip')).limited).toBe(false);
    expect((await limiter.check('ip')).remaining).toBe(0);
    const third = await limiter.check('ip');
    expect(third.limited).toBe(true);
    expect(third.remaining).toBe(0);
  });

  it('resets after the window TTL elapses', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 }, new RedisRateLimitStore(makeFakeRedis()));

    expect((await limiter.check('ip')).limited).toBe(false);
    expect((await limiter.check('ip')).limited).toBe(true);

    vi.advanceTimersByTime(60_001);

    expect((await limiter.check('ip')).limited).toBe(false);
  });

  it('falls back to the in-memory store when the Redis eval throws', async () => {
    const flaky: RateLimitRedis = {
      eval: vi.fn(async () => {
        throw new Error('redis down');
      }),
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const limiter = createRateLimiter(
      { windowMs: 60_000, max: 1 },
      new RedisRateLimitStore(flaky, new MemoryRateLimitStore()),
    );

    // Both calls degrade to the memory fallback, which still enforces the cap.
    expect((await limiter.check('ip')).limited).toBe(false);
    expect((await limiter.check('ip')).limited).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
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
