// ============================================================
// In-memory rate limiter for Next.js route handlers.
//
// NOTE: This is a best-effort per-instance limiter. For multi-instance
// deployments (Vercel serverless, multi-region, autoscaling) use a
// shared store such as Upstash Redis or Vercel KV.
// ============================================================

import type { NextRequest } from 'next/server';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

export interface RateLimitResult {
  limited: boolean;
  remaining: number;
  resetAt: number;
}

// Lazy sweep: instead of setInterval (which leaks and keeps the worker alive),
// we clean up expired entries during ordinary calls when the map gets large.
const MAX_ENTRIES_BEFORE_SWEEP = 10_000;

export function createRateLimiter(config: RateLimitConfig) {
  const store = new Map<string, RateLimitEntry>();

  function check(key: string): RateLimitResult {
    const now = Date.now();

    if (store.size > MAX_ENTRIES_BEFORE_SWEEP) {
      for (const [k, v] of store) {
        if (now > v.resetAt) store.delete(k);
      }
    }

    const entry = store.get(key);
    if (!entry || now > entry.resetAt) {
      const resetAt = now + config.windowMs;
      store.set(key, { count: 1, resetAt });
      return { limited: false, remaining: config.max - 1, resetAt };
    }

    entry.count += 1;
    const remaining = Math.max(0, config.max - entry.count);
    return {
      limited: entry.count > config.max,
      remaining,
      resetAt: entry.resetAt,
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
    const xff = request.headers.get('x-forwarded-for');
    if (xff) {
      // First value = original client, per RFC 7239 when proxies are trusted.
      const first = xff.split(',')[0]?.trim();
      if (first) return first;
    }
    const realIp = request.headers.get('x-real-ip');
    if (realIp) return realIp;
  }

  return 'direct';
}
