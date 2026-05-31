// ============================================================
// Shared Redis client for the cross-instance rate limiter.
//
// Activated only when REDIS_URL is set. Without it getRateLimitRedis()
// returns null and the rate limiter falls back to a per-instance
// in-memory store. A single ioredis connection is pinned to a global
// so Next.js hot-reload / route-module re-evaluation reuses it instead
// of opening a fresh socket on every reload.
// ============================================================

import Redis from 'ioredis';

/**
 * The minimal slice of the Redis client the rate limiter relies on.
 * Keeping the surface narrow lets tests inject a fake without dragging
 * in ioredis' full (heavily overloaded) type.
 */
export interface RateLimitRedis {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

declare global {
  var __fuelynRateLimitRedis: RateLimitRedis | null | undefined;
}

let cached: RateLimitRedis | null | undefined = globalThis.__fuelynRateLimitRedis;

/**
 * Returns the shared Redis handle, or null when REDIS_URL is not
 * configured (the caller then uses the in-memory limiter). Memoised:
 * the first call decides Redis-or-null for the lifetime of the process.
 */
export function getRateLimitRedis(): RateLimitRedis | null {
  if (cached !== undefined) return cached;

  const url = process.env.REDIS_URL;
  if (!url || url.trim() === '') {
    cached = null;
    globalThis.__fuelynRateLimitRedis = null;
    return null;
  }

  const client = new Redis(url, {
    // Bound per-command latency: surface a failure after a couple of
    // retries instead of hanging a route handler on an unreachable node.
    maxRetriesPerRequest: 2,
    // The limiter degrades to memory on error, so don't queue commands
    // against a cold/unreachable server — fail fast and fall back.
    enableOfflineQueue: false,
  });

  // An unhandled 'error' event would crash the process; the limiter
  // already catches per-command failures, so just log here.
  client.on('error', (err: Error) => {
    console.warn('[redis] rate-limit client error:', err.message);
  });

  const handle = client as unknown as RateLimitRedis;
  cached = handle;
  globalThis.__fuelynRateLimitRedis = handle;
  return handle;
}
