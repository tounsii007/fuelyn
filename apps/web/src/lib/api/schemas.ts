// ============================================================
// Shared Zod schemas for BFF route input validation.
//
// Kept in one place so front-end forms and BFF routes stay in lockstep.
// ============================================================

import { z } from 'zod';

// ─── Primitives ─────────────────────────────────────────────

export const Latitude = z.coerce.number().gte(-90).lte(90);
export const Longitude = z.coerce.number().gte(-180).lte(180);
export const RadiusKm = z.coerce.number().gt(0).lte(50);
export const FuelTypeEnum = z.enum(['diesel', 'e5', 'e10']);

// ─── Advisor ────────────────────────────────────────────────

export const AdvisorRequestSchema = z.object({
  prices: z
    .array(
      z.object({
        stationName: z.string().min(1).max(200),
        brand: z.string().max(100).default(''),
        price: z.number().positive().finite(),
        distance: z.number().gte(0).finite(),
      }),
    )
    .min(1)
    .max(50),
  fuelType: FuelTypeEnum,
  priceHistory: z
    .array(
      z.object({
        price: z.number().positive().finite(),
        timestamp: z.string().min(1).max(40),
      }),
    )
    .max(500)
    .optional(),
  lat: Latitude.optional(),
  lng: Longitude.optional(),
  fillUpLiters: z.number().int().min(10).max(200).optional(),
});
export type AdvisorRequest = z.infer<typeof AdvisorRequestSchema>;

// ─── Geographic search ──────────────────────────────────────

export const GeoSearchQuerySchema = z.object({
  lat: Latitude,
  lng: Longitude,
  rad: RadiusKm.default(10),
});
export type GeoSearchQuery = z.infer<typeof GeoSearchQuerySchema>;

// ─── Price history ──────────────────────────────────────────

export const PriceHistoryQuerySchema = z.object({
  stationId: z.string().min(1).max(64),
  fuelType: FuelTypeEnum.default('e10'),
  days: z.coerce.number().int().min(1).max(90).default(30),
});
export type PriceHistoryQuery = z.infer<typeof PriceHistoryQuerySchema>;

// ─── Price collection (cron) ────────────────────────────────

export const PriceCollectionBodySchema = z
  .object({
    lat: Latitude.optional(),
    lng: Longitude.optional(),
    radiusKm: RadiusKm.optional(),
    cities: z
      .array(
        z.object({
          name: z.string().min(1).max(128),
          lat: Latitude,
          lng: Longitude,
        }),
      )
      .optional(),
  })
  .optional();
export type PriceCollectionBody = z.infer<typeof PriceCollectionBodySchema>;
