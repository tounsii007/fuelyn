// ============================================================
// redis/client — ioredis is mocked (no real connection). We verify
// that getRateLimitRedis() returns null without REDIS_URL (so the
// limiter uses memory) and that, when REDIS_URL is set, it constructs
// exactly one client with bounded-retry options and memoises it. The
// client is pinned to a global, so each test resets modules + the
// global and re-imports fresh.
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { RedisCtorMock, evalMock, onMock } = vi.hoisted(() => {
  const evalMock = vi.fn(async () => [1, 1000]);
  const onMock = vi.fn();
  // A regular function (not an arrow) so it can be invoked with `new`.
  const RedisCtorMock = vi.fn(function () {
    return { eval: evalMock, on: onMock };
  });
  return { RedisCtorMock, evalMock, onMock };
});

vi.mock('ioredis', () => ({ default: RedisCtorMock }));

describe('redis/client', () => {
  beforeEach(() => {
    vi.resetModules();
    RedisCtorMock.mockClear();
    evalMock.mockClear();
    onMock.mockClear();
    delete (globalThis as { __fuelynRateLimitRedis?: unknown }).__fuelynRateLimitRedis;
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null when REDIS_URL is unset', async () => {
    const { getRateLimitRedis } = await import('./client');
    expect(getRateLimitRedis()).toBeNull();
    expect(RedisCtorMock).not.toHaveBeenCalled();
  });

  it('returns null for a blank REDIS_URL', async () => {
    vi.stubEnv('REDIS_URL', '   ');
    const { getRateLimitRedis } = await import('./client');
    expect(getRateLimitRedis()).toBeNull();
    expect(RedisCtorMock).not.toHaveBeenCalled();
  });

  it('constructs one bounded-retry client from REDIS_URL and memoises it', async () => {
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
    const { getRateLimitRedis } = await import('./client');

    const first = getRateLimitRedis();
    const second = getRateLimitRedis();

    expect(first).not.toBeNull();
    expect(second).toBe(first); // memoised — not reconstructed
    expect(RedisCtorMock).toHaveBeenCalledTimes(1);
    expect(RedisCtorMock).toHaveBeenCalledWith(
      'redis://localhost:6379',
      expect.objectContaining({ maxRetriesPerRequest: 2, enableOfflineQueue: false }),
    );
    // An 'error' handler is attached so a connection blip can't crash the worker.
    expect(onMock).toHaveBeenCalledWith('error', expect.any(Function));
  });
});
