// ============================================================
// Prisma client singleton.
//
// Next.js dev hot-reload otherwise creates a new PrismaClient on
// every module reload, which exhausts SQLite connections in
// minutes. Pinning to a global ensures we re-use one instance
// across reloads.
// ============================================================

import { PrismaClient } from '@prisma/client';

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
