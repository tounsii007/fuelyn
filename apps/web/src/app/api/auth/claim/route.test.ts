// ============================================================
// Integration test — POST /api/auth/claim (magic-link redemption).
// Drives the real handler with a real NextRequest. The security-
// critical branches are exercised end-to-end: CSRF, malformed body,
// and the four "generic reject" oracles (unknown / expired token,
// email-mismatch takeover guard) plus the happy-path account upgrade
// that mints a session cookie. Mocked edges: the DB client and the
// JWT helpers (sha256Hex / signJwt are deterministic stubs). CSRF +
// the in-memory rate limiter run for real.
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  authTokenFindUnique,
  authTokenUpdate,
  userFindUnique,
  userUpdate,
  userDelete,
  syncUpdateMany,
  txnMock,
  signJwtMock,
} = vi.hoisted(() => ({
  authTokenFindUnique: vi.fn(),
  authTokenUpdate: vi.fn(async () => ({})),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(async () => ({})),
  userDelete: vi.fn(async () => ({})),
  syncUpdateMany: vi.fn(async () => ({})),
  txnMock: vi.fn(async () => []),
  signJwtMock: vi.fn(() => 'signed.jwt'),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    authToken: { findUnique: authTokenFindUnique, update: authTokenUpdate },
    user: { findUnique: userFindUnique, update: userUpdate, delete: userDelete },
    syncRecord: { updateMany: syncUpdateMany },
    $transaction: txnMock,
  },
}));
vi.mock('@/lib/auth/jwt', () => ({
  sha256Hex: (s: string) => `hash:${s}`,
  signJwt: signJwtMock,
  verifyJwt: () => ({ valid: false }),
}));

import { POST } from './route';

const VALID_TOKEN = 'a'.repeat(43);
const EMAIL = 'driver@example.com';

let ipCounter = 0;
function makeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  ipCounter += 1;
  return new NextRequest('https://localhost:49443/api/auth/claim', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-fuelyn-csrf': '1',
      origin: 'http://localhost:3000',
      'x-forwarded-for': `10.0.2.${ipCounter}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function validToken(overrides: Record<string, unknown> = {}) {
  return {
    id: 'auth1',
    kind: 'magic-link',
    consumedAt: null,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    email: EMAIL,
    userId: 'u1',
    ...overrides,
  };
}

describe('POST /api/auth/claim', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('RATE_LIMIT_TRUST_PROXY', '1');
    authTokenFindUnique.mockReset();
    authTokenUpdate.mockClear();
    userFindUnique.mockReset();
    userUpdate.mockClear();
    userDelete.mockClear();
    syncUpdateMany.mockClear();
    txnMock.mockClear();
    txnMock.mockResolvedValue([]);
    signJwtMock.mockClear();
    signJwtMock.mockReturnValue('signed.jwt');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('rejects a request without the CSRF header (403)', async () => {
    const res = await POST(makeRequest({ token: VALID_TOKEN, email: EMAIL }, { 'x-fuelyn-csrf': '' }));
    expect(res.status).toBe(403);
  });

  it('rejects a malformed body (400)', async () => {
    const res = await POST(makeRequest({ token: 'short', email: EMAIL }));
    expect(res.status).toBe(400);
  });

  it('rejects an unknown token (400)', async () => {
    authTokenFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ token: VALID_TOKEN, email: EMAIL }));
    expect(res.status).toBe(400);
  });

  it('rejects an expired token (400)', async () => {
    authTokenFindUnique.mockResolvedValue(validToken({ expiresAt: new Date(Date.now() - 1000) }));
    const res = await POST(makeRequest({ token: VALID_TOKEN, email: EMAIL }));
    expect(res.status).toBe(400);
  });

  it('rejects when the body email does not match the token (400, takeover guard)', async () => {
    authTokenFindUnique.mockResolvedValue(validToken({ email: 'someone-else@example.com' }));
    const res = await POST(makeRequest({ token: VALID_TOKEN, email: EMAIL }));
    expect(res.status).toBe(400);
    expect(txnMock).not.toHaveBeenCalled();
  });

  it('upgrades the anonymous user and mints a session cookie (200)', async () => {
    authTokenFindUnique.mockResolvedValue(validToken());
    userFindUnique.mockImplementation(async (args: { where: { id?: string; email?: string } }) => {
      if (args.where.id) return { id: 'u1', email: null, deviceId: 'dev1' };
      return null; // no existing user owns the email → straight upgrade
    });

    const res = await POST(makeRequest({ token: VALID_TOKEN, email: EMAIL }));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; userId: string; email: string };
    expect(json.success).toBe(true);
    expect(json.userId).toBe('u1');
    expect(json.email).toBe(EMAIL);
    expect(res.headers.get('set-cookie')).toContain('fuelyn_session=signed.jwt');
    expect(txnMock).toHaveBeenCalledTimes(1);
    expect(signJwtMock).toHaveBeenCalledTimes(1);
  });
});
