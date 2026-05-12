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
// NEXT_PHASE skip: `next build` evaluates every API-route module to
// collect page data. During that phase NODE_ENV=production but
// DATABASE_URL is typically the same dev SQLite URL since no real
// secrets are wired into the build container. The check must only
// fire at request time, not at build time — Next.js sets
// `NEXT_PHASE=phase-production-build` for exactly this distinction.
if (isProduction() && process.env.NEXT_PHASE !== 'phase-production-build') {
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
