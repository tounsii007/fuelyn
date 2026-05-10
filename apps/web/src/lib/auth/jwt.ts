// ============================================================
// Minimal HS256 JWT — no external dep.
//
// We deliberately avoid `jose` / `jsonwebtoken` to keep the
// bundle small + dep-free. HS256 is sufficient for our use case
// (single-issuer, single-verifier, server-only validation).
//
// Tokens carry:
//   sub  — user id
//   exp  — Unix seconds expiry
//   iat  — Unix seconds issued-at
//   typ  — "session" | "magic"
//
// Secret comes from FUELYN_JWT_SECRET. In dev we fall back to a
// per-process random — fine because dev DBs are throw-away.
// ============================================================

import { createHmac, timingSafeEqual, randomBytes, createHash } from 'node:crypto';

const DEV_SECRET_FALLBACK = randomBytes(32).toString('hex');

function getSecret(): string {
  return process.env.FUELYN_JWT_SECRET ?? DEV_SECRET_FALLBACK;
}

interface JwtClaims {
  sub: string;
  exp: number;
  iat: number;
  typ: 'session' | 'magic';
}

const HEADER_B64 = base64UrlEncode(
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), 'utf8'),
);

export function signJwt(claims: Omit<JwtClaims, 'iat'>): string {
  const fullClaims: JwtClaims = {
    ...claims,
    iat: Math.floor(Date.now() / 1000),
  };
  const payload = base64UrlEncode(Buffer.from(JSON.stringify(fullClaims), 'utf8'));
  const signing = `${HEADER_B64}.${payload}`;
  const sig = base64UrlEncode(
    createHmac('sha256', getSecret()).update(signing).digest(),
  );
  return `${signing}.${sig}`;
}

export interface JwtVerifyResult {
  valid: boolean;
  reason?: 'malformed' | 'bad-signature' | 'expired' | 'wrong-type';
  claims?: JwtClaims;
}

export function verifyJwt(
  token: string,
  expectedType: 'session' | 'magic' = 'session',
  now: number = Math.floor(Date.now() / 1000),
): JwtVerifyResult {
  if (typeof token !== 'string') return { valid: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'malformed' };
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  const expectedSig = createHmac('sha256', getSecret())
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  let providedSig: Buffer;
  try {
    providedSig = base64UrlDecode(sigB64);
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (
    expectedSig.length !== providedSig.length ||
    !timingSafeEqual(expectedSig, providedSig)
  ) {
    return { valid: false, reason: 'bad-signature' };
  }

  let claims: JwtClaims;
  try {
    claims = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as JwtClaims;
  } catch {
    return { valid: false, reason: 'malformed' };
  }

  if (claims.exp <= now) return { valid: false, reason: 'expired' };
  if (claims.typ !== expectedType) return { valid: false, reason: 'wrong-type' };

  return { valid: true, claims };
}

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(s: string): Buffer {
  const pad = (4 - (s.length % 4)) % 4;
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad), 'base64');
}

/** sha256 hex of a string — used for token-hash lookups. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
