// ============================================================
// BFF — POST /api/reports
//
// Phase 8: proxies a price-correction report from the user's
// device to the Java price-service. The BFF acts as the trust
// boundary:
//   • validates input shape (Zod-ish manual checks)
//   • derives a stable client fingerprint from the request so the
//     backend can per-device rate-limit without us shipping any PII
//   • adds a per-IP soft cap as a second layer
//
// On success returns { id, status } so the UI can show a confirmation.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, BackendApiError } from '@/lib/api/backend-client';
import { createRateLimiter, getClientKey } from '@/lib/http/rate-limit';
import { enforceSameOrigin } from '@/lib/auth/csrf';

// Per-IP soft cap — the docstring's promised "second layer" (the backend
// also rate-limits per device fingerprint). Generous enough for genuine
// corrections, tight enough to neuter trivial spam loops.
const limiter = createRateLimiter({ windowMs: 60_000, max: 10 });

interface ReportPayload {
  stationId: string;
  fuelType: 'diesel' | 'e5' | 'e10';
  displayedPrice?: number;
  reportedPrice?: number;
  note?: string;
}

export async function POST(request: NextRequest) {
  // State-changing proxy → enforce same-origin + the custom CSRF header
  // (the trust boundary the docstring promises), mirroring /api/prices/report.
  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  // Per-IP soft cap. `await` works whether check() is sync (today) or async
  // (after the shared-store limiter lands), so this stays correct either way.
  const rl = await limiter.check(`report:${getClientKey(request)}`);
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Zu viele Meldungen — bitte später erneut versuchen.' },
      { status: 429 },
    );
  }

  let body: ReportPayload;
  try {
    body = (await request.json()) as ReportPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // ─── Input shape ─────────────────────────────────────────────
  if (!body.stationId || typeof body.stationId !== 'string' || body.stationId.length < 10) {
    return NextResponse.json({ error: 'Invalid stationId' }, { status: 400 });
  }
  if (!['diesel', 'e5', 'e10'].includes(body.fuelType)) {
    return NextResponse.json({ error: 'Invalid fuelType' }, { status: 400 });
  }
  if (body.reportedPrice != null && (body.reportedPrice <= 0 || body.reportedPrice > 99.9)) {
    return NextResponse.json({ error: 'reportedPrice out of range' }, { status: 400 });
  }
  if (body.note != null && body.note.length > 500) {
    return NextResponse.json({ error: 'note too long (max 500)' }, { status: 400 });
  }

  // ─── Derive client fingerprint ───────────────────────────────
  // Stable hash per device: combine UA + IP + Accept-Language. This
  // is enough for backend rate-limiting and isn't PII (no cookies,
  // no IDs). When a real auth system lands, the user-id replaces
  // this opaque string.
  const ua = request.headers.get('user-agent') ?? '';
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          ?? request.headers.get('x-real-ip')
          ?? 'unknown';
  const lang = request.headers.get('accept-language') ?? '';
  const fingerprint = await sha256Hex(`${ua}|${ip}|${lang}`);

  try {
    const result = await backendFetch<{ success: boolean; data?: { id: number; status: string } }>(
      '/api/v1/reports',
      {
        method: 'POST',
        body: {
          stationId: body.stationId,
          fuelType: body.fuelType,
          displayedPrice: body.displayedPrice ?? null,
          reportedPrice: body.reportedPrice ?? null,
          note: body.note ?? null,
          clientFingerprint: fingerprint,
        },
      },
    );

    if (result.success && result.data) {
      return NextResponse.json({ id: result.data.id, status: result.data.status }, { status: 201 });
    }
    return NextResponse.json({ error: 'Backend rejected the report' }, { status: 502 });
  } catch (error) {
    if (error instanceof BackendApiError && error.status === 429) {
      return NextResponse.json(
        { error: 'Zu viele Meldungen — bitte später erneut versuchen.' },
        { status: 429 },
      );
    }
    console.error('[BFF] Report submit failed:', error);
    return NextResponse.json({ error: 'Failed to submit report' }, { status: 502 });
  }
}

/** Subtle-Crypto SHA-256 → lowercase hex. Edge-runtime safe. */
async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
