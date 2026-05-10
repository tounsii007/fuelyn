// ============================================================
// Stripe webhook-signature verification tests.
// ============================================================

import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyStripeSignature } from '../stripe-signature';

const SECRET = 'whsec_test_test_test_test';
const NOW = 1700000000;

function buildHeader(rawBody: string, ts: number = NOW, secret: string = SECRET): string {
  const sig = createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  return `t=${ts},v1=${sig}`;
}

describe('verifyStripeSignature — happy path', () => {
  it('accepts a correctly-signed body', () => {
    const body = '{"id":"evt_1","type":"customer.subscription.created"}';
    const header = buildHeader(body);
    const r = verifyStripeSignature(body, header, SECRET, NOW);
    expect(r.valid).toBe(true);
    expect(r.timestamp).toBe(NOW);
  });

  it('accepts when multiple v1 signatures present (rotation case)', () => {
    const body = '{"a":1}';
    const sig = createHmac('sha256', SECRET).update(`${NOW}.${body}`).digest('hex');
    // Stripe sends one valid + one stale during a key rotation.
    const header = `t=${NOW},v1=deadbeef,v1=${sig}`;
    expect(verifyStripeSignature(body, header, SECRET, NOW).valid).toBe(true);
  });
});

describe('verifyStripeSignature — rejections', () => {
  it('returns no-secret when secret missing', () => {
    const r = verifyStripeSignature('{}', 't=1,v1=ff', undefined, NOW);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('no-secret');
  });

  it('returns missing-header on null', () => {
    const r = verifyStripeSignature('{}', null, SECRET, NOW);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('missing-header');
  });

  it('returns malformed-header on garbage', () => {
    expect(verifyStripeSignature('{}', 'no-equals-sign', SECRET, NOW).reason)
      .toBe('malformed-header');
  });

  it('rejects when timestamp is more than 5 minutes off', () => {
    const body = '{}';
    const header = buildHeader(body, NOW - 600);
    const r = verifyStripeSignature(body, header, SECRET, NOW);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('timestamp-skew');
  });

  it('rejects when secret is wrong', () => {
    const body = '{}';
    const header = buildHeader(body, NOW, 'whsec_other');
    const r = verifyStripeSignature(body, header, SECRET, NOW);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('bad-signature');
  });

  it('rejects when payload was tampered post-signing', () => {
    const original = '{"a":1}';
    const tampered = '{"a":2}';
    const header = buildHeader(original);
    const r = verifyStripeSignature(tampered, header, SECRET, NOW);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('bad-signature');
  });

  it('handles empty v1 list cleanly', () => {
    const r = verifyStripeSignature('{}', `t=${NOW}`, SECRET, NOW);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('malformed-header');
  });
});

describe('verifyStripeSignature — tolerance window', () => {
  it('accepts at exactly the boundary', () => {
    const body = '{}';
    const header = buildHeader(body, NOW - 300);
    const r = verifyStripeSignature(body, header, SECRET, NOW);
    expect(r.valid).toBe(true);
  });

  it('respects a custom tolerance', () => {
    const body = '{}';
    const header = buildHeader(body, NOW - 10);
    expect(verifyStripeSignature(body, header, SECRET, NOW, 5).valid).toBe(false);
    expect(verifyStripeSignature(body, header, SECRET, NOW, 30).valid).toBe(true);
  });
});
