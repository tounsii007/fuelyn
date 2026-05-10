// ============================================================
// BFF — /api/sync
//
// GET  → returns every SyncRecord owned by the calling user.
// POST → upserts an array of { kind, payload, updatedAt? } rows.
//        Server uses last-write-wins on updatedAt; if the client's
//        updatedAt is older than the stored row, the row is left
//        alone and the server's version is returned in the response
//        so the client can pick it up.
//
// Auth: anonymous-first. Header X-Fuelyn-Device must be set on
// first call; subsequent calls can use either the device id or
// the session JWT cookie that this endpoint sets on first hit.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { getOrCreateSession, buildSessionCookie } from '@/lib/auth/session';
import { parseJson } from '@/lib/http/validate';

const KIND_PATTERN = /^[a-z][a-z0-9-]{1,40}$/;

const PushSchema = z.object({
  records: z
    .array(
      z.object({
        kind: z.string().regex(KIND_PATTERN),
        /** JSON-encoded payload — server stores it verbatim. */
        payload: z.string().min(1).max(1_000_000),
        /** Optional client-side updatedAt for last-write-wins. */
        updatedAt: z.string().datetime().optional(),
      }),
    )
    .max(40),
});

export async function GET(request: NextRequest) {
  const session = await getOrCreateSession(request);
  if (!session) {
    return NextResponse.json({ error: 'No device id' }, { status: 401 });
  }
  const records = await prisma.syncRecord.findMany({
    where: { userId: session.userId },
    select: { kind: true, payload: true, updatedAt: true },
  });
  const res = NextResponse.json({ records });
  if (session.newToken) {
    res.headers.set('Set-Cookie', buildSessionCookie(session.newToken));
  }
  return res;
}

export async function POST(request: NextRequest) {
  const session = await getOrCreateSession(request);
  if (!session) {
    return NextResponse.json({ error: 'No device id' }, { status: 401 });
  }
  const parsed = await parseJson(request, PushSchema);
  if (!parsed.success) return parsed.response;

  const conflicts: Array<{ kind: string; serverPayload: string; serverUpdatedAt: string }> = [];
  const accepted: string[] = [];

  for (const r of parsed.data.records) {
    const clientTime = r.updatedAt ? new Date(r.updatedAt) : new Date();
    const existing = await prisma.syncRecord.findUnique({
      where: { userId_kind: { userId: session.userId, kind: r.kind } },
      select: { payload: true, updatedAt: true },
    });
    if (existing && existing.updatedAt.getTime() > clientTime.getTime() + 500) {
      // Server is newer — return it back as a conflict so the client
      // can reconcile (or just accept the server version).
      conflicts.push({
        kind: r.kind,
        serverPayload: existing.payload,
        serverUpdatedAt: existing.updatedAt.toISOString(),
      });
      continue;
    }
    await prisma.syncRecord.upsert({
      where: { userId_kind: { userId: session.userId, kind: r.kind } },
      update: { payload: r.payload },
      create: { userId: session.userId, kind: r.kind, payload: r.payload },
    });
    accepted.push(r.kind);
  }

  const res = NextResponse.json({ accepted, conflicts });
  if (session.newToken) {
    res.headers.set('Set-Cookie', buildSessionCookie(session.newToken));
  }
  return res;
}

/** Wipe every sync record for the user — used by "log out / start fresh". */
export async function DELETE(request: NextRequest) {
  const session = await getOrCreateSession(request);
  if (!session) {
    return NextResponse.json({ error: 'No device id' }, { status: 401 });
  }
  const r = await prisma.syncRecord.deleteMany({ where: { userId: session.userId } });
  return NextResponse.json({ deleted: r.count });
}
