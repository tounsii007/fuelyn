// ============================================================
// BFF — DELETE /api/account  (Iter AH — GDPR Art. 17)
//
// Wipes every row that references the calling user across the
// schema. Required by GDPR right-to-erasure. Returns 200 on
// success with the per-table delete counts so the client can
// surface a confirmation toast.
//
// What gets erased:
//   * SyncRecord (cascade)
//   * AuthToken (cascade)
//   * PriceReport — userId set to NULL (we keep the report
//     contents because they fed the aggregation already; the
//     content itself isn't personal data — the link to the user
//     is what we erase). ipHash is wiped.
//   * TelemetryEvent — userId set to NULL for the same reason.
//   * User row itself.
//
// CSRF guard + per-IP rate limit (deletions are precious and we
// don't want a hostile page on another tab triggering this).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { getOrCreateSession } from '@/lib/auth/session';
import { enforceSameOrigin } from '@/lib/auth/csrf';
import { createRateLimiter, getClientKey } from '@/lib/http/rate-limit';

const limiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 5 });

export async function DELETE(request: NextRequest) {
  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const ip = getClientKey(request);
  const rl = limiter.check(`account-del:${ip}`);
  if (rl.limited) return NextResponse.json({ error: 'rate limit' }, { status: 429 });

  const session = await getOrCreateSession(request);
  if (!session) return NextResponse.json({ error: 'No session' }, { status: 401 });
  const userId = session.userId;

  // Anonymise the data we keep, then drop the User row. Wrap in a
  // transaction so a partial failure can't leave dangling links.
  const [reports, events, syncRows, tokens, deleted] = await prisma.$transaction([
    prisma.priceReport.updateMany({
      where: { userId },
      data: { userId: null, ipHash: null },
    }),
    prisma.telemetryEvent.updateMany({
      where: { userId },
      data: { userId: null },
    }),
    prisma.syncRecord.deleteMany({ where: { userId } }),
    prisma.authToken.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  // Drop the session cookie so subsequent requests start fresh
  // (a new anonymous User will be created on the next sync).
  const res = NextResponse.json({
    success: true,
    counts: {
      priceReportsAnonymized: reports.count,
      telemetryEventsAnonymized: events.count,
      syncRecordsDeleted: syncRows.count,
      authTokensDeleted: tokens.count,
      userDeleted: !!deleted,
    },
  });
  res.headers.set(
    'Set-Cookie',
    'fuelyn_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
  );
  return res;
}
