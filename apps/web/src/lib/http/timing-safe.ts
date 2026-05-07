// ============================================================
// Constant-time string comparison.
//
// Guards against timing side-channels when comparing shared
// secrets such as CRON_SECRET, API keys, or HMAC digests.
// ============================================================

import { timingSafeEqual } from 'node:crypto';

/**
 * Compare two strings in (near) constant time.
 *
 * Different lengths short-circuit to `false`, but we still run a
 * constant-time compare on equal-length buffers to minimize the
 * length-dependent timing leak.
 */
export function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) {
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}
