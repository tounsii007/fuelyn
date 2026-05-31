// ============================================================
// Integration test — POST /api/auth/magic-link. Drives the real route
// handler with a real NextRequest. CSRF, the (real, in-memory) rate
// limiter, Zod validation and the dev-echo / SMTP-send / prod-guard /
// send-failure branches are exercised end-to-end; only the edges are
// mocked: the DB client (authToken.create), the session resolver, the
// runtime env helpers (isProduction / origins), and the mail sender.
// Each request carries a unique X-Forwarded-For (proxy-trust on) so the
// shared module-level limiter buckets per test instead of accumulating.
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { authTokenCreate } = vi.hoisted(() => ({
  authTokenCreate: vi.fn(async () => ({ id: 'tok1' })),
}));
const { getOrCreateSessionMock } = vi.hoisted(() => ({
  getOrCreateSessionMock: vi.fn(),
}));
const { sendMagicLinkEmailMock } = vi.hoisted(() => ({
  sendMagicLinkEmailMock: vi.fn(async (_arg: { to: string; link: string }) => undefined),
}));
const { isProductionMock } = vi.hoisted(() => ({
  isProductionMock: vi.fn(() => false),
}));

vi.mock('@/lib/db/client', () => ({ prisma: { authToken: { create: authTokenCreate } } }));
vi.mock('@/lib/auth/session', () => ({ getOrCreateSession: getOrCreateSessionMock }));
vi.mock('@/lib/mail/transport', () => ({ sendMagicLinkEmail: sendMagicLinkEmailMock }));
vi.mock('@/lib/config/runtime', () => ({
  isProduction: isProductionMock,
  publicAppOrigin: () => 'http://localhost:3000',
  allowedOrigins: () => ['http://localhost:3000'],
}));

import { POST } from './route';

let ipCounter = 0;
function makeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  ipCounter += 1;
  return new NextRequest('https://localhost:49443/api/auth/magic-link', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-fuelyn-csrf': '1',
      origin: 'http://localhost:3000',
      'x-forwarded-for': `10.0.1.${ipCounter}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/magic-link', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('RATE_LIMIT_TRUST_PROXY', '1');
    authTokenCreate.mockClear();
    getOrCreateSessionMock.mockClear();
    getOrCreateSessionMock.mockResolvedValue({ userId: 'u1' });
    sendMagicLinkEmailMock.mockClear();
    sendMagicLinkEmailMock.mockResolvedValue(undefined);
    isProductionMock.mockReturnValue(false);
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('rejects a request without the CSRF header (403)', async () => {
    const res = await POST(makeRequest({ email: 'driver@example.com' }, { 'x-fuelyn-csrf': '' }));
    expect(res.status).toBe(403);
  });

  it('rate-limits after 3 requests from the same IP (429)', async () => {
    const ip = '10.0.9.9';
    const send = () => POST(makeRequest({ email: 'a@b.de' }, { 'x-forwarded-for': ip }));
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(429);
  });

  it('returns 401 when no session can be resolved', async () => {
    getOrCreateSessionMock.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ email: 'driver@example.com' }));
    expect(res.status).toBe(401);
  });

  it('rejects an invalid email (400)', async () => {
    const res = await POST(makeRequest({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
  });

  it('dev without a transport: stores the token and echoes the dev link', async () => {
    const res = await POST(makeRequest({ email: 'driver@example.com' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; devLink?: string };
    expect(json.success).toBe(true);
    expect(json.devLink).toContain('/auth/claim?token=');
    expect(authTokenCreate).toHaveBeenCalledTimes(1);
    expect(sendMagicLinkEmailMock).not.toHaveBeenCalled();
  });

  it('sends the email when MAIL_TRANSPORT is configured (no dev link leaked)', async () => {
    vi.stubEnv('MAIL_TRANSPORT', 'smtps://user:pass@smtp.example.com:465');
    const res = await POST(makeRequest({ email: 'driver@example.com' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; devLink?: string };
    expect(json.devLink).toBeUndefined();
    expect(sendMagicLinkEmailMock).toHaveBeenCalledTimes(1);
    const arg = sendMagicLinkEmailMock.mock.calls[0]![0] as { to: string; link: string };
    expect(arg.to).toBe('driver@example.com');
    expect(arg.link).toContain('/auth/claim?token=');
  });

  it('refuses in production without a transport (503)', async () => {
    isProductionMock.mockReturnValue(true);
    const res = await POST(makeRequest({ email: 'driver@example.com' }));
    expect(res.status).toBe(503);
    expect(authTokenCreate).not.toHaveBeenCalled();
  });

  it('returns 502 when the email send fails', async () => {
    vi.stubEnv('MAIL_TRANSPORT', 'smtps://user:pass@smtp.example.com:465');
    sendMagicLinkEmailMock.mockRejectedValueOnce(new Error('smtp down'));
    const res = await POST(makeRequest({ email: 'driver@example.com' }));
    expect(res.status).toBe(502);
  });
});
