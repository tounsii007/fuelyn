// ============================================================
// TankPilot — Zod Validation Schemas
// Runtime validation for all Tankerkönig API responses.
// Each schema maps raw API data → validated domain model.
// ============================================================

import { z } from 'zod';

// ─── Shared Primitives ───────────────────────────────────────

const coordinateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const fuelTypeSchema = z.enum(['diesel', 'e5', 'e10']);

const fuelLevelUnitSchema = z.enum(['percentage', 'liters', 'km']);

const themeModeSchema = z.enum(['light', 'dark', 'system']);

const localeSchema = z.enum(['de', 'en', 'en-US', 'fr']);

// ─── API: List Response ──────────────────────────────────────

const apiStationSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  brand: z.string(),
  street: z.string(),
  houseNumber: z.string().nullable().default('').transform((v) => v ?? ''),
  postCode: z.union([z.string(), z.number()]).transform(String),
  place: z.string(),
  lat: z.number(),
  lng: z.number(),
  dist: z.number(),
  // List endpoint returns `price` (single field for requested type);
  // Detail endpoint returns diesel/e5/e10 separately.
  price: z.number().nullable().optional().default(null),
  diesel: z.number().nullable().optional().default(null),
  e5: z.number().nullable().optional().default(null),
  e10: z.number().nullable().optional().default(null),
  isOpen: z.boolean(),
});

export const apiListResponseSchema = z.object({
  ok: z.boolean(),
  license: z.string().optional(),
  data: z.string().optional(),
  status: z.string().optional(),
  stations: z.array(apiStationSchema),
});

export type ApiListResponse = z.infer<typeof apiListResponseSchema>;
export type ApiStationRaw = z.infer<typeof apiStationSchema>;

// ─── API: Prices Response ────────────────────────────────────

const stationPriceEntrySchema = z.object({
  status: z.enum(['open', 'closed', 'no prices', 'not found']),
  e5: z.number().nullable().optional().default(null),
  e10: z.number().nullable().optional().default(null),
  diesel: z.number().nullable().optional().default(null),
});

export const apiPricesResponseSchema = z.object({
  ok: z.boolean(),
  license: z.string().optional(),
  data: z.string().optional(),
  prices: z.record(z.string(), stationPriceEntrySchema),
});

export type ApiPricesResponse = z.infer<typeof apiPricesResponseSchema>;
export type ApiStationPriceEntry = z.infer<typeof stationPriceEntrySchema>;

// ─── API: Detail Response ────────────────────────────────────

const openingTimeSchema = z.object({
  text: z.string(),
  start: z.string(),
  end: z.string(),
});

const apiStationDetailSchema = apiStationSchema.extend({
  dist: z.number().optional().default(0), // detail endpoint doesn't return dist
  openingTimes: z.array(openingTimeSchema).default([]),
  overrides: z.array(z.string()).nullable().default([]),
  wholeDay: z.boolean().default(false),
  state: z.string().nullable().optional(),
});

export const apiDetailResponseSchema = z.object({
  ok: z.boolean(),
  license: z.string().optional(),
  data: z.string().optional(),
  station: apiStationDetailSchema,
});

export type ApiDetailResponse = z.infer<typeof apiDetailResponseSchema>;
export type ApiStationDetailRaw = z.infer<typeof apiStationDetailSchema>;

// ─── Domain: Vehicle Profile ─────────────────────────────────

const driveTypeSchema = z.enum(['benzin', 'diesel', 'hybrid', 'elektro', 'gas', 'h2']);

const connectorTypeSchema = z.enum(['type2', 'ccs', 'chademo', 'schuko', 'type1', 'tesla_supercharger', 'other']);
const gasTypeSchema = z.enum(['lpg', 'cng', 'lng']);

export const vehicleProfileSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  fuelType: fuelTypeSchema,
  driveType: driveTypeSchema.default('benzin'),
  consumption: z.number().positive().max(50),
  tankCapacity: z.number().nonnegative().max(200).nullable(),
  batteryCapacity: z.number().positive().max(200).nullable().default(null),
  currentRange: z.number().nonnegative().max(2000).nullable(),
  currentFuelLevel: z.number().nonnegative().nullable(),
  currentFuelUnit: fuelLevelUnitSchema,
  // Extended EV/H2/Gas fields (backward-compatible with .default/.optional)
  connectorTypes: z.array(connectorTypeSchema).optional().default([]),
  maxChargingPowerKW: z.number().positive().max(500).nullable().optional().default(null),
  h2Compatible: z.boolean().optional().default(false),
  preferredGasType: gasTypeSchema.nullable().optional().default(null),
});

// ─── Domain: Favorite Station ────────────────────────────────

export const favoriteStationSchema = z.object({
  stationId: z.string().min(1),
  name: z.string(),
  brand: z.string(),
  addedAt: z.string().datetime(),
});

// ─── Domain: App Settings ────────────────────────────────────

export const appSettingsSchema = z.object({
  theme: themeModeSchema,
  locale: localeSchema,
  defaultRadiusKm: z.number().positive(),
  defaultFuelType: fuelTypeSchema,
  mapStyle: z.enum(['standard', 'dark', 'satellite', 'terrain']),
  background: z.enum(['aurora', 'sunset', 'ocean', 'forest', 'cyber', 'minimal']).default('aurora'),
});

// ─── Domain: Station Filter ─────────────────────────────────

export const stationFilterSchema = z.object({
  fuelType: fuelTypeSchema,
  radiusKm: z.number().positive(),
  onlyOpen: z.boolean(),
  brands: z.array(z.string()),
  priceMin: z.number().nonnegative().nullable(),
  priceMax: z.number().nonnegative().nullable(),
});

// ─── Coordinate input ────────────────────────────────────────

export { coordinateSchema, fuelTypeSchema };

// ─── Mappers: API → Domain ──────────────────────────────────

import type { Station, StationDetail } from '../domain/types';

/**
 * Map raw API station object to domain Station.
 * @param raw - Parsed API station data
 * @param requestedFuelType - The fuel type that was requested (list endpoint returns `price` for this type)
 */
export function mapApiStation(raw: ApiStationRaw, requestedFuelType?: string): Station {
  // List endpoint returns a single `price` field for the requested fuel type.
  // Detail endpoint returns diesel/e5/e10 separately.
  // Merge both sources so prices are never lost.
  const prices = {
    diesel: raw.diesel,
    e5: raw.e5,
    e10: raw.e10,
  };

  // If the list endpoint returned `price`, assign it to the correct fuel type
  if (raw.price != null && requestedFuelType) {
    if (requestedFuelType === 'diesel') prices.diesel = prices.diesel ?? raw.price;
    else if (requestedFuelType === 'e5') prices.e5 = prices.e5 ?? raw.price;
    else if (requestedFuelType === 'e10') prices.e10 = prices.e10 ?? raw.price;
  }

  return {
    id: raw.id,
    name: raw.name,
    brand: raw.brand,
    street: raw.street,
    houseNumber: raw.houseNumber,
    postCode: String(raw.postCode),
    place: raw.place,
    lat: raw.lat,
    lng: raw.lng,
    dist: raw.dist,
    prices,
    isOpen: raw.isOpen,
  };
}

/** Map raw API detail object to domain StationDetail. */
export function mapApiStationDetail(raw: ApiStationDetailRaw): StationDetail {
  return {
    ...mapApiStation(raw),
    openingTimes: raw.openingTimes,
    overrides: raw.overrides ?? [],
    wholeDay: raw.wholeDay,
  };
}
