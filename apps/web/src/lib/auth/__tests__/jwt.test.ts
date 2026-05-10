// ============================================================
// HS256 JWT — engine tests.
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { signJwt, verifyJwt, sha256Hex } from '../jwt';

beforeEach(() => {
  process.env.FUELYN_JWT_SECRET = 'test-secret-test-secret-test-secret';
});

describe('signJwt / verifyJwt — round trip', () => {
  it('signs and verifies a session token', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({ sub: 'user-1', exp: now + 60, typ: 'session' });
    const v = verifyJwt(token, 'session', now);
    expect(v.valid).toBe(true);
    expect(v.claims?.sub).toBe('user-1');
    expect(v.claims?.typ).toBe('session');
  });

  it('rejects expired tokens', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({ sub: 'user-1', exp: now - 1, typ: 'session' });
    const v = verifyJwt(token, 'session', now);
    expect(v.valid).toBe(false);
    expect(v.reason).toBe('expired');
  });

  it('rejects wrong typ', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({ sub: 'u', exp: now + 60, typ: 'magic' });
    const v = verifyJwt(token, 'session', now);
    expect(v.valid).toBe(false);
    expect(v.reason).toBe('wrong-type');
  });

  it('rejects malformed tokens', () => {
    expect(verifyJwt('').valid).toBe(false);
    expect(verifyJwt('a.b').valid).toBe(false);
    expect(verifyJwt('not.a.jwt').valid).toBe(false);
  });

  it('rejects tokens signed with a different secret', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({ sub: 'u', exp: now + 60, typ: 'session' });
    process.env.FUELYN_JWT_SECRET = 'a-different-secret-a-different-secret';
    const v = verifyJwt(token, 'session', now);
    expect(v.valid).toBe(false);
    expect(v.reason).toBe('bad-signature');
  });

  it('rejects tampered payloads', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({ sub: 'user-1', exp: now + 60, typ: 'session' });
    // Flip a single character in the payload section.
    const parts = token.split('.');
    parts[1] = parts[1]!.slice(0, -2) + 'aa';
    const tampered = parts.join('.');
    const v = verifyJwt(tampered, 'session', now);
    expect(v.valid).toBe(false);
    expect(v.reason === 'bad-signature' || v.reason === 'malformed').toBe(true);
  });
});

describe('sha256Hex', () => {
  it('produces a stable 64-char hex digest', () => {
    const h = sha256Hex('hello');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex('hello')).toBe(h); // deterministic
  });

  it('different inputs produce different hashes', () => {
    expect(sha256Hex('a')).not.toBe(sha256Hex('b'));
  });
});
