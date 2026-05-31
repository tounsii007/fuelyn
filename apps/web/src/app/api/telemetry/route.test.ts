// ============================================================
// Integration test — POST /api/telemetry. Drives the real handler
// with a real NextRequest, covering the cross-cutting BFF contract on
// a data route: CSRF guard, session requirement, Zod batch validation,
// and the find-or-create ingest. Mocked edges: the DB client
// (telemetryEvent) and the session resolver. CSRF + the in-memory
// rate limiter run for real.
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { telFindFirst, telUpdate, telCreate, getOrCreateSessionMock } = vi.hoisted(() => ({
  telFindFirst: vi.fn(async () => null),
  telUpdate: vi.fn(async () => ({})),
  telCreate: vi.fn(async () => ({})),
  getOrCreateSessionMock: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: { telemetryEvent: { findFirst: telFindFirst, update: telUpdate, create: telCreate } },
}));
vi.mock('@/lib/auth/session', () => ({ getOrCreateSession: getOrCreateSessionMock }));

import { POST } from './route';

let ipCounter = 0;
function makeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  ipCounter += 1;
  return new NextRequest('https://localhost:49443/api/telemetry', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-fuelyn-csrf': '1',
      origin: 'http://localhost:3000',
      'x-forwarded-for': `10.0.3.${ipCounter}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/telemetry', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('RATE_LIMIT_TRUST_PROXY', '1');
    telFindFirst.mockReset();
    telFindFirst.mockResolvedValue(null);
    telUpdate.mockClear();
    telCreate.mockClear();
    getOrCreateSessionMock.mockClear();
    getOrCreateSessionMock.mockResolvedValue({ userId: 'u1' });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('rejects a request without the CSRF header (403)', async () => {
    const res = await POST(makeRequest({ events: [{ name: 'app.open', day: '2026-01-01' }] }, { 'x-fuelyn-csrf': '' }));
    expect(res.status).toBe(403);
  });

  it('returns 401 when no session can be resolved', async () => {
    getOrCreateSessionMock.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ events: [{ name: 'app.open', day: '2026-01-01' }] }));
    expect(res.status).toBe(401);
  });

  it('rejects a malformed event name (400)', async () => {
    const res = await POST(makeRequest({ events: [{ name: 'Invalid Name', day: '2026-01-01' }] }));
    expect(res.status).toBe(400);
    expect(telCreate).not.toHaveBeenCalled();
  });

  it('ingests a valid batch, creating one row per new event (200)', async () => {
    const res = await POST(
      makeRequest({
        events: [
          { name: 'app.open', day: '2026-01-01' },
          { name: 'station.view', day: '2026-01-01' },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { accepted: number };
    expect(json.accepted).toBe(2);
    expect(telCreate).toHaveBeenCalledTimes(2);
  });
});
