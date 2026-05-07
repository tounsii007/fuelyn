import { z } from 'zod';

const lngLatTupleSchema = z.tuple([z.number(), z.number()]);

const routeGeometrySchema = z.object({
  coordinates: z.array(lngLatTupleSchema),
});

const routeStepSchema = z.object({
  distance: z.number(),
  duration: z.number(),
  name: z.string().optional().default(''),
  geometry: routeGeometrySchema.optional(),
  maneuver: z.object({
    type: z.string().optional().default(''),
    modifier: z.string().optional(),
    location: lngLatTupleSchema.optional(),
    bearing_after: z.number().optional().default(0),
  }),
});

const routeLegSchema = z.object({
  steps: z.array(routeStepSchema).optional().default([]),
});

const routeEntrySchema = z.object({
  distance: z.number(),
  duration: z.number(),
  geometry: routeGeometrySchema,
  legs: z.array(routeLegSchema).optional().default([]),
});

export const osrmRouteResponseSchema = z.object({
  code: z.string(),
  routes: z.array(routeEntrySchema).optional().default([]),
});

export type OsrmRouteResponse = z.infer<typeof osrmRouteResponseSchema>;

export function parseOsrmRouteResponse(raw: unknown): OsrmRouteResponse | null {
  const parsed = osrmRouteResponseSchema.safeParse(raw);
  if (!parsed.success) return null;
  if (parsed.data.code !== 'Ok' || parsed.data.routes.length === 0) return null;
  return parsed.data;
}
