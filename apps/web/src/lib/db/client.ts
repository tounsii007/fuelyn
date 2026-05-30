// ============================================================
// Prisma client singleton.
//
// Next.js dev hot-reload otherwise creates a new PrismaClient on
// every module reload, which exhausts SQLite connections in
// minutes. Pinning to a global ensures we re-use one instance
// across reloads.
// ============================================================

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { isProduction } from '@/lib/config/runtime';

// Single source of truth for the Prisma client (the former
// `db/prisma.ts` re-exports this module). Persistence is Postgres
// everywhere; production must NOT silently fall back to a local /
// throwaway database, or User / SyncRecord / Subscription state and
// Stripe-webhook lookups would target the wrong store.
//
// Skip cases for the guard below:
//   1. `next build`: NEXT_PHASE=phase-production-build, every API-route
//      module is evaluated to collect page data. Build-time secrets are
//      never wired in, so the check would always trip.
//   2. Localhost dev/staging: `next build` hard-codes NODE_ENV=production
//      into the compiled bundle, so the standalone server runs as
//      "production" inside Docker even though it's a dev environment.
//      A localhost-bound FUELYN_PUBLIC_ORIGIN is the operator saying
//      "I know this points at a local Postgres, that's fine".
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
      '[fuelyn-db] DATABASE_URL must point at a Postgres database (postgresql://…) in production. A missing or file: URL is rejected.',
    );
  }
}

declare global {

  var __fuelynPrisma: PrismaClient | undefined;
}

// Prisma 7 driver adapter — pg speaks Postgres over the DATABASE_URL
// connection string. The pool connects lazily (first query), so the
// localhost fallback below is safe during `next build` page-data
// collection where no DATABASE_URL is wired in.
function buildClient(): PrismaClient {
  const connectionString =
    process.env.DATABASE_URL ??
    'postgresql://fuelyn:fuelyn@localhost:25432/fuelyn_web';
  const adapter = new PrismaPg({ connectionString });
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
