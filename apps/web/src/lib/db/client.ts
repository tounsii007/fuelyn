// ============================================================
// Prisma client singleton.
//
// Next.js dev hot-reload otherwise creates a new PrismaClient on
// every module reload, which exhausts SQLite connections in
// minutes. Pinning to a global ensures we re-use one instance
// across reloads.
// ============================================================

import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { isProduction } from '@/lib/config/runtime';

// Iter AH: production must NOT silently fall back to file-based SQLite.
// Vercel serverless gives every cold start a fresh ephemeral disk, so
// SQLite would lose all User / SyncRecord / Subscription state on each
// restart — webhooks would fail to find the customer they're updating.
//
// Skip cases:
//   1. `next build`: NEXT_PHASE=phase-production-build, every API-route
//      module is evaluated to collect page data. Build-time secrets are
//      never wired in, so the check would always trip.
//   2. Localhost dev/staging: `next build` hard-codes NODE_ENV=production
//      into the compiled bundle, so the standalone server runs as
//      "production" inside Docker even though it's a dev environment.
//      A localhost-bound FUELYN_PUBLIC_ORIGIN is the operator saying
//      "I know this is SQLite, I'm running it locally, that's fine".
const PUBLIC_ORIGIN = process.env.FUELYN_PUBLIC_ORIGIN ?? '';
const IS_LOCAL_DEPLOY =
  PUBLIC_ORIGIN.includes('localhost') ||
  PUBLIC_ORIGIN.includes('127.0.0.1') ||
  PUBLIC_ORIGIN.includes('fuelyn.localhost');

if (
  isProduction() &&
  process.env.NEXT_PHASE !== 'phase-production-build' &&
  !IS_LOCAL_DEPLOY
) {
  const url = process.env.DATABASE_URL ?? '';
  if (!url || url.startsWith('file:')) {
    throw new Error(
      '[fuelyn-db] DATABASE_URL must point at a non-SQLite database in production. SQLite on serverless is ephemeral and unsafe.',
    );
  }
}

declare global {

  var __fuelynPrisma: PrismaClient | undefined;
}

// Prisma 7 requires an adapter on the default "client" engine.
// libsql speaks SQLite over the same `file:` URL the rest of the
// codebase already uses, so the switch is transparent to callers.
function buildClient(): PrismaClient {
  const url = process.env.DATABASE_URL ?? 'file:./prisma/dev.db';
  const adapter = new PrismaLibSql({ url });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma: PrismaClient =
  globalThis.__fuelynPrisma ?? buildClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__fuelynPrisma = prisma;
}
