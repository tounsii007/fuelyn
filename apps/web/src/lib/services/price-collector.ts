// ============================================================
// Fuelyn — Price Collection Service
// Server-side service that fetches prices from Tankerkoenig
// and persists them to SQLite via Prisma.
// ============================================================

import { prisma } from '@/lib/db/prisma';
import {
  ApiClient,
  StationService,
  API_BASE_URL,
} from '@fuelyn/core';
import type { FuelType, Station } from '@fuelyn/core';

// ─── Types ──────────────────────────────────────────────────

export interface CollectionResult {
  runId: number;
  stationsCount: number;
  pricesCount: number;
  durationMs: number;
  status: 'completed' | 'failed';
  error?: string;
}

export interface CollectionCity {
  name: string;
  lat: number;
  lng: number;
}

// ─── Default collection cities ──────────────────────────────

export const COLLECTION_CITIES: CollectionCity[] = [
  { name: 'Berlin', lat: 52.52, lng: 13.405 },
  { name: 'Hamburg', lat: 53.5511, lng: 9.9937 },
  { name: 'München', lat: 48.1351, lng: 11.582 },
  { name: 'Köln', lat: 50.9375, lng: 6.9603 },
  { name: 'Frankfurt', lat: 50.1109, lng: 8.6821 },
  { name: 'Stuttgart', lat: 48.7758, lng: 9.1829 },
  { name: 'Düsseldorf', lat: 51.2277, lng: 6.7735 },
  { name: 'Leipzig', lat: 51.3397, lng: 12.3731 },
  { name: 'Dortmund', lat: 51.5136, lng: 7.4653 },
  { name: 'Nürnberg', lat: 49.4521, lng: 11.0767 },
];

// ─── Fuel types to collect ──────────────────────────────────

const FUEL_TYPES: FuelType[] = ['diesel', 'e5', 'e10'];

// ─── Service factory ────────────────────────────────────────

function createStationService(): StationService {
  const apiKey = process.env.TANKERKOENIG_API_KEY;
  if (!apiKey) {
    throw new Error('TANKERKOENIG_API_KEY environment variable is not set');
  }

  const client = new ApiClient({ baseUrl: API_BASE_URL });
  return new StationService({ client, apiKey });
}

// ─── Core collection functions ──────────────────────────────

/**
 * Search stations in an area and store all current prices.
 * Uses the Tankerkoenig list endpoint for each fuel type,
 * deduplicates stations, then stores prices + metadata.
 */
export async function collectPricesForArea(
  lat: number,
  lng: number,
  radiusKm: number = 10,
): Promise<{ stationsCount: number; pricesCount: number }> {
  const service = createStationService();
  const now = new Date();

  // Fetch stations for all fuel types to capture all prices
  const allStations = new Map<string, Station>();

  for (const fuelType of FUEL_TYPES) {
    try {
      const stations = await service.searchStations({
        lat,
        lng,
        radiusKm: Math.min(radiusKm, 25), // API limit
        fuelType,
        sort: 'dist',
      });

      for (const station of stations) {
        // Merge prices from different fuel type queries
        const existing = allStations.get(station.id);
        if (existing) {
          allStations.set(station.id, {
            ...existing,
            prices: {
              diesel: existing.prices.diesel ?? station.prices.diesel,
              e5: existing.prices.e5 ?? station.prices.e5,
              e10: existing.prices.e10 ?? station.prices.e10,
            },
          });
        } else {
          allStations.set(station.id, station);
        }
      }
    } catch (error) {
      console.error(`[PriceCollector] Failed to fetch ${fuelType} stations at (${lat}, ${lng}):`, error);
    }
  }

  if (allStations.size === 0) {
    return { stationsCount: 0, pricesCount: 0 };
  }

  // Store station metadata (upsert)
  const metaUpserts = Array.from(allStations.values()).map((station) =>
    prisma.stationMeta.upsert({
      where: { id: station.id },
      update: {
        name: station.name,
        brand: station.brand,
        lat: station.lat,
        lng: station.lng,
        street: station.street || null,
        city: station.place || null,
        postCode: station.postCode || null,
      },
      create: {
        id: station.id,
        name: station.name,
        brand: station.brand,
        lat: station.lat,
        lng: station.lng,
        street: station.street || null,
        city: station.place || null,
        postCode: station.postCode || null,
      },
    }),
  );

  await Promise.all(metaUpserts);

  // Build price snapshot records
  const priceRecords: { stationId: string; fuelType: string; price: number; timestamp: Date }[] = [];

  for (const station of allStations.values()) {
    for (const fuelType of FUEL_TYPES) {
      const price = station.prices?.[fuelType];
      if (price != null && price > 0) {
        priceRecords.push({
          stationId: station.id,
          fuelType,
          price,
          timestamp: now,
        });
      }
    }
  }

  // Bulk insert price snapshots
  if (priceRecords.length > 0) {
    await prisma.priceSnapshot.createMany({ data: priceRecords });
  }

  return {
    stationsCount: allStations.size,
    pricesCount: priceRecords.length,
  };
}

/**
 * Fetch current prices for specific station IDs and store them.
 * Uses the Tankerkoenig prices endpoint (batch).
 */
export async function collectPricesForStations(
  stationIds: string[],
): Promise<{ stationsCount: number; pricesCount: number }> {
  if (stationIds.length === 0) {
    return { stationsCount: 0, pricesCount: 0 };
  }

  const service = createStationService();
  const now = new Date();

  try {
    const updates = await service.fetchPrices(stationIds);

    const priceRecords: { stationId: string; fuelType: string; price: number; timestamp: Date }[] = [];

    for (const update of updates) {
      for (const fuelType of FUEL_TYPES) {
        const price = update.prices[fuelType];
        if (price != null && price > 0) {
          priceRecords.push({
            stationId: update.stationId,
            fuelType,
            price,
            timestamp: now,
          });
        }
      }
    }

    if (priceRecords.length > 0) {
      await prisma.priceSnapshot.createMany({ data: priceRecords });
    }

    return {
      stationsCount: updates.length,
      pricesCount: priceRecords.length,
    };
  } catch (error) {
    console.error('[PriceCollector] Failed to fetch prices for stations:', error);
    throw error;
  }
}

/**
 * Run a full collection across multiple cities.
 * Creates a CollectionRun record to track progress.
 */
export async function runFullCollection(
  cities: CollectionCity[] = COLLECTION_CITIES,
  radiusKm: number = 10,
): Promise<CollectionResult> {
  const startTime = Date.now();

  // Create collection run record
  const run = await prisma.collectionRun.create({
    data: { status: 'running' },
  });

  let totalStations = 0;
  let totalPrices = 0;

  try {
    // Process cities sequentially to avoid overwhelming the API
    for (const city of cities) {
      try {
        const result = await collectPricesForArea(city.lat, city.lng, radiusKm);
        totalStations += result.stationsCount;
        totalPrices += result.pricesCount;

        console.log(
          `[PriceCollector] ${city.name}: ${result.stationsCount} stations, ${result.pricesCount} prices`,
        );
      } catch (error) {
        console.error(`[PriceCollector] Failed to collect for ${city.name}:`, error);
        // Continue with other cities even if one fails
      }
    }

    // Update collection run with results
    await prisma.collectionRun.update({
      where: { id: run.id },
      data: {
        completedAt: new Date(),
        stationsCount: totalStations,
        pricesCount: totalPrices,
        status: 'completed',
      },
    });

    return {
      runId: run.id,
      stationsCount: totalStations,
      pricesCount: totalPrices,
      durationMs: Date.now() - startTime,
      status: 'completed',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await prisma.collectionRun.update({
      where: { id: run.id },
      data: {
        completedAt: new Date(),
        stationsCount: totalStations,
        pricesCount: totalPrices,
        status: 'failed',
        error: errorMessage,
      },
    });

    return {
      runId: run.id,
      stationsCount: totalStations,
      pricesCount: totalPrices,
      durationMs: Date.now() - startTime,
      status: 'failed',
      error: errorMessage,
    };
  }
}

/**
 * Get station IDs that appear most frequently in the price history.
 * Useful for targeting cron collections at popular stations.
 */
export async function getTopStations(limit: number = 50): Promise<string[]> {
  const result = await prisma.priceSnapshot.groupBy({
    by: ['stationId'],
    _count: { stationId: true },
    orderBy: { _count: { stationId: 'desc' } },
    take: limit,
  });

  return result.map((r) => r.stationId);
}
