// ============================================================
// Stripe webhook-signature verification.
//
// Stripe signs every webhook delivery with HMAC-SHA256 and ships
// the signature in `Stripe-Signature: t=<unix>,v1=<hex>,...`.
//
// We verify it ourselves rather than pulling in the `stripe`
// npm package — the verification recipe is short, well-specified,
// and adding the SDK pulls in 600+ kB of code we don't otherwise
// need server-side.
//
// Reference: https://docs.stripe.com/webhooks/signatures
// ============================================================

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface StripeSignatureVerification {
  valid: boolean;
  reason?: 'missing-header' | 'malformed-header' | 'no-secret' | 'timestamp-skew' | 'bad-signature';
  /** Parsed Unix-second timestamp from the header — useful for telemetry. */
  timestamp?: number;
}

const DEFAULT_TOLERANCE_SECONDS = 5 * 60; // Stripe recommends 5 min

/**
 * Verify a Stripe webhook signature header.
 *
 * @param rawBody  the raw HTTP body (MUST be untouched bytes — JSON.parse
 *                 then re-stringify breaks the HMAC)
 * @param header   the value of the Stripe-Signature header
 * @param secret   the endpoint secret (whsec_…)
 * @param now      Unix-second clock; injectable for tests
 * @param tol      tolerance in seconds for timestamp skew
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string | undefined,
  now: number = Math.floor(Date.now() / 1000),
  tol: number = DEFAULT_TOLERANCE_SECONDS,
): StripeSignatureVerification {
  if (!secret) return { valid: false, reason: 'no-secret' };
  if (!header) return { valid: false, reason: 'missing-header' };

  // Header shape: "t=1700000000,v1=hex,v1=hex,v0=hex"
  let timestamp: number | null = null;
  const v1Sigs: string[] = [];
  for (const part of header.split(',')) {
    const idx = part.indexOf('=');
    if (idx < 0) return { valid: false, reason: 'malformed-header' };
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === 't') {
      const n = Number(v);
      if (!Number.isFinite(n)) return { valid: false, reason: 'malformed-header' };
      timestamp = n;
    } else if (k === 'v1') {
      v1Sigs.push(v);
    }
  }

  if (timestamp == null || v1Sigs.length === 0) {
    return { valid: false, reason: 'malformed-header' };
  }

  if (Math.abs(now - timestamp) > tol) {
    return { valid: false, reason: 'timestamp-skew', timestamp };
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', secret).update(signedPayload).digest();

  for (const candidate of v1Sigs) {
    let candidateBuf: Buffer;
    try {
      candidateBuf = Buffer.from(candidate, 'hex');
    } catch {
      continue;
    }
    if (
      candidateBuf.length === expected.length &&
      timingSafeEqual(candidateBuf, expected)
    ) {
      return { valid: true, timestamp };
    }
  }
  return { valid: false, reason: 'bad-signature', timestamp };
}
