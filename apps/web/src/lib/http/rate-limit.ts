// ============================================================
// Rate limiter for Next.js route handlers.
//
// Backed by a SHARED store when REDIS_URL is configured (so a limit
// holds across serverless / multi-instance / multi-region deploys) and
// a per-instance in-memory store otherwise. `check()` is async in both
// modes. A Redis hiccup degrades to the in-memory store rather than
// taking the route down.
// ============================================================

import type { NextRequest } from 'next/server';
import { getRateLimitRedis, type RateLimitRedis } from '@/lib/redis/client';

export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

export interface RateLimitResult {
  limited: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * A store records one hit against `key` inside a fixed `windowMs`
 * window and returns the running count plus the window's reset time.
 */
export interface RateLimitStore {
  hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}

// ─── In-memory store (best-effort, per process) ─────────────
//
// Lazy sweep: instead of setInterval (which leaks and keeps the worker
// alive) we drop expired entries during ordinary calls once the map
// grows large.
const MAX_ENTRIES_BEFORE_SWEEP = 10_000;

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly store = new Map<string, { count: number; resetAt: number }>();

  async hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const now = Date.now();

    if (this.store.size > MAX_ENTRIES_BEFORE_SWEEP) {
      for (const [k, v] of this.store) {
        if (now > v.resetAt) this.store.delete(k);
      }
    }

    const entry = this.store.get(key);
    if (!entry || now > entry.resetAt) {
      const resetAt = now + windowMs;
      this.store.set(key, { count: 1, resetAt });
      return { count: 1, resetAt };
    }

    entry.count += 1;
    return { count: entry.count, resetAt: entry.resetAt };
  }
}

// ─── Redis store (shared across instances) ──────────────────
//
// Atomic fixed-window counter: INCR the key, set the TTL on the first
// hit of a window, and read back the remaining TTL — all in one Lua
// eval so two concurrent requests can't race the expire (which would
// otherwise leak a key that never resets).
const FIXED_WINDOW_LUA = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {c, ttl}
`;

export class RedisRateLimitStore implements RateLimitStore {
  private readonly redis: RateLimitRedis;
  private readonly fallback: RateLimitStore;

  constructor(redis: RateLimitRedis, fallback: RateLimitStore = new MemoryRateLimitStore()) {
    this.redis = redis;
    this.fallback = fallback;
  }

  async hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    try {
      const raw = await this.redis.eval(FIXED_WINDOW_LUA, 1, `rl:${key}`, windowMs);
      const [count, ttl] = raw as [number, number];
      const ttlMs = typeof ttl === 'number' && ttl > 0 ? ttl : windowMs;
      return { count: Number(count), resetAt: Date.now() + ttlMs };
    } catch (err) {
      // A Redis hiccup must never lock everyone out — degrade to the
      // per-instance memory store (still some protection) and log.
      console.warn('[rate-limit] redis store failed, using memory fallback:', err);
      return this.fallback.hit(key, windowMs);
    }
  }
}

// ─── Default store selection ────────────────────────────────
//
// One shared Redis-backed store across every limiter when REDIS_URL is
// set (keys are namespaced by the caller, so a single store is correct);
// otherwise each limiter gets its own memory store — preserving
// single-instance isolation and per-test independence.
let sharedRedisStore: RateLimitStore | null = null;

function resolveDefaultStore(): RateLimitStore {
  const redis = getRateLimitRedis();
  if (!redis) return new MemoryRateLimitStore();
  if (!sharedRedisStore) sharedRedisStore = new RedisRateLimitStore(redis);
  return sharedRedisStore;
}

/**
 * Create a limiter for a fixed window. `check(key)` returns whether the
 * caller is over `max` within `windowMs`. Pass an explicit `store` to
 * inject a fake in tests; otherwise the default (Redis or memory) is used.
 */
export function createRateLimiter(config: RateLimitConfig, store?: RateLimitStore) {
  const backing = store ?? resolveDefaultStore();

  async function check(key: string): Promise<RateLimitResult> {
    const { count, resetAt } = await backing.hit(key, config.windowMs);
    return {
      limited: count > config.max,
      remaining: Math.max(0, config.max - count),
      resetAt,
    };
  }

  return { check };
}

/**
 * Extract the client IP from a request.
 *
 * Only trusts `x-forwarded-for` / `x-real-ip` when RATE_LIMIT_TRUST_PROXY=1
 * is set — otherwise those headers can be spoofed by any client.
 * When not trusted, falls back to a shared "direct" bucket so the limiter
 * still works (more conservative globally).
 */
export function getClientKey(request: NextRequest): string {
  const trustProxy = process.env.RATE_LIMIT_TRUST_PROXY === '1';

  if (trustProxy) {
    // Prefer x-real-ip: a trusted proxy sets it to the real peer it saw.
    const realIp = request.headers.get('x-real-ip')?.trim();
    if (realIp) return realIp;
    // Else take the RIGHTMOST x-forwarded-for entry — the one appended by our
    // own trusted proxy (= the real peer). The leftmost values are
    // client-supplied and trivially spoofable, so we never trust them.
    const xff = request.headers.get('x-forwarded-for');
    if (xff) {
      const parts = xff.split(',').map((p) => p.trim()).filter(Boolean);
      const last = parts[parts.length - 1];
      if (last) return last;
    }
  }

  return 'direct';
}
