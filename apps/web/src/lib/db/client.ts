// ============================================================
// Prisma client singleton.
//
// Next.js dev hot-reload otherwise creates a new PrismaClient on
// every module reload, which exhausts SQLite connections in
// minutes. Pinning to a global ensures we re-use one instance
// across reloads.
// ============================================================

import { PrismaClient } from '@prisma/client';
import { isProduction } from '@/lib/config/runtime';

// Iter AH: production must NOT silently fall back to file-based SQLite.
// Vercel serverless gives every cold start a fresh ephemeral disk, so
// SQLite would lose all User / SyncRecord / Subscription state on each
// restart — webhooks would fail to find the customer they're updating.
if (isProduction()) {
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

export const prisma: PrismaClient =
  globalThis.__fuelynPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__fuelynPrisma = prisma;
}
