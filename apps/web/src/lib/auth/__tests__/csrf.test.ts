// ============================================================
// CSRF / same-origin enforcement tests.
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { enforceSameOrigin } from '../csrf';

beforeEach(() => {
  // Pin the configured public origin used by allowedOrigins().
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('FUELYN_PUBLIC_ORIGIN', 'http://localhost:3000');
});

function makeRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/sync', {
    method: 'POST',
    headers,
  });
}

describe('enforceSameOrigin', () => {
  it('passes when both X-Fuelyn-Csrf=1 AND Origin allowed', () => {
    const req = makeRequest({
      'x-fuelyn-csrf': '1',
      origin: 'http://localhost:3000',
    });
    expect(enforceSameOrigin(req)).toBeNull();
  });

  it('rejects when CSRF header missing', () => {
    const req = makeRequest({ origin: 'http://localhost:3000' });
    const r = enforceSameOrigin(req);
    expect(r).not.toBeNull();
    expect(r!.status).toBe(403);
  });

  it('rejects when CSRF header is wrong value', () => {
    const req = makeRequest({
      'x-fuelyn-csrf': '0',
      origin: 'http://localhost:3000',
    });
    expect(enforceSameOrigin(req)).not.toBeNull();
  });

  it('rejects cross-origin even with CSRF header', () => {
    const req = makeRequest({
      'x-fuelyn-csrf': '1',
      origin: 'https://evil.example',
    });
    const r = enforceSameOrigin(req);
    expect(r).not.toBeNull();
    expect(r!.status).toBe(403);
  });

  it('falls back to Referer host when Origin missing', () => {
    const req = makeRequest({
      'x-fuelyn-csrf': '1',
      referer: 'http://localhost:3000/some/page',
    });
    expect(enforceSameOrigin(req)).toBeNull();
  });

  it('rejects bad Referer host', () => {
    const req = makeRequest({
      'x-fuelyn-csrf': '1',
      referer: 'https://evil.example/path',
    });
    expect(enforceSameOrigin(req)).not.toBeNull();
  });

  it('passes when neither Origin nor Referer set (e.g. server-to-server with CSRF header)', () => {
    // Same-origin server-internal calls won't set Origin/Referer; we
    // only enforce them when present, otherwise just require the
    // CSRF custom header.
    const req = makeRequest({ 'x-fuelyn-csrf': '1' });
    expect(enforceSameOrigin(req)).toBeNull();
  });
});
