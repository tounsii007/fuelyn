// ============================================================
// BFF — POST /api/telemetry
// Privacy-respecting event ingest. The client batches events and
// posts them; we upsert into TelemetryEvent with a (userId, name,
// variant, day) unique key so dups coalesce into a single row.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { getOrCreateSession } from '@/lib/auth/session';
import { enforceSameOrigin } from '@/lib/auth/csrf';
import { parseJson } from '@/lib/http/validate';
import { createRateLimiter, getClientKey } from '@/lib/http/rate-limit';

const limiter = createRateLimiter({ windowMs: 60_000, max: 30 });

const EventSchema = z.object({
  name: z.string().min(1).max(80).regex(/^[a-z][a-z0-9.-]+$/),
  variant: z.string().min(1).max(40).regex(/^[a-z0-9-]+$/).optional(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const BatchSchema = z.object({
  events: z.array(EventSchema).min(1).max(50),
});

export async function POST(request: NextRequest) {
  // CSRF guard — even though telemetry events are nominally
  // low-impact, they create DB rows attributed to the calling user.
  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const ip = getClientKey(request);
  const rl = limiter.check(`telemetry:${ip}`);
  if (rl.limited) return NextResponse.json({ error: 'rate limit' }, { status: 429 });

  // Telemetry requires a session — getOrCreateSession upserts a User
  // row from X-Fuelyn-Device on first contact, so this never blocks
  // a real client (only callers with no device id are turned away).
  const session = await getOrCreateSession(request);
  if (!session) return NextResponse.json({ error: 'No device id' }, { status: 401 });
  const userId = session.userId;

  const parsed = await parseJson(request, BatchSchema);
  if (!parsed.success) return parsed.response;

  let written = 0;
  for (const ev of parsed.data.events) {
    try {
      // Find-or-create-then-increment. We don't use upsert with a
      // composite key directly because variant is nullable in the
      // schema and SQLite's composite-PK + null support is fiddly.
      const existing = await prisma.telemetryEvent.findFirst({
        where: {
          userId,
          name: ev.name,
          variant: ev.variant ?? null,
          day: ev.day,
        },
        select: { id: true },
      });
      if (existing) {
        await prisma.telemetryEvent.update({
          where: { id: existing.id },
          data: { count: { increment: 1 } },
        });
      } else {
        await prisma.telemetryEvent.create({
          data: {
            userId,
            name: ev.name,
            variant: ev.variant ?? null,
            day: ev.day,
          },
        });
      }
      written++;
    } catch {
      // ignore — never let telemetry failures escape to the user
    }
  }
  return NextResponse.json({ accepted: written });
}
