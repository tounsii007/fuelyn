// ============================================================
// BFF — GET / PUT /api/preferences
//
// Phase C3 — cross-device sync. Each request is authenticated by
// the Java gateway (JWT in Authorization header). When the user
// is anonymous we fall back to client-fingerprint-keyed local
// storage and skip the sync round-trip — no degradation, just no
// cross-device persistence.
//
// PUT body shape is intentionally permissive (any JSON object).
// The server stores it as-is; client owns the schema. The gateway
// enforces a 32 KB payload limit so a runaway client can't blow
// up the DB.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, BackendApiError } from '@/lib/api/backend-client';

const MAX_PAYLOAD_BYTES = 32 * 1024;

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!auth) {
    // Anonymous → 204, client uses local storage exclusively.
    return new NextResponse(null, { status: 204 });
  }

  try {
    const result = await backendFetch<{ payload: unknown; updatedAt: string }>(
      '/api/v1/users/me/preferences',
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BackendApiError && err.status === 404) {
      return new NextResponse(null, { status: 204 });
    }
    return NextResponse.json({ error: 'sync unavailable' }, { status: 502 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!auth) {
    // Anonymous PUT is a client bug — surface the silent no-op.
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  if (raw.length > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ error: 'payload too large' }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  if (typeof payload !== 'object' || payload === null) {
    return NextResponse.json({ error: 'expected object' }, { status: 400 });
  }

  try {
    await backendFetch<{ ok: true; updatedAt: string }>(
      '/api/v1/users/me/preferences',
      { method: 'PUT', body: payload },
    );
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof BackendApiError && err.status === 401) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    return NextResponse.json({ error: 'sync failed' }, { status: 502 });
  }
}
