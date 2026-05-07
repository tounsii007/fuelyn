// ============================================================
// Mock Price History Generator
// Produces realistic-looking price data for chart prototyping.
// ============================================================

export interface PriceDataPoint {
  readonly timestamp: string; // ISO 8601
  readonly price: number;
}

/**
 * Generate a realistic mock price history for a given number of days.
 *
 * The generator simulates:
 * - A base price around 1.60-1.80 EUR
 * - Day-of-week patterns (cheaper Tue/Wed, pricier Fri/Sat)
 * - Time-of-day noise (not modelled at daily grain)
 * - Random walk with mean reversion
 *
 * @param days Number of days to generate (7 or 30 typically)
 * @param basePrice Starting price level
 * @param fuelType Used to offset base price realistically
 */
export function generateMockPriceHistory(
  days: number,
  basePrice?: number,
  fuelType?: 'diesel' | 'e5' | 'e10',
): PriceDataPoint[] {
  const base = basePrice ?? (
    fuelType === 'diesel' ? 1.589
    : fuelType === 'e5' ? 1.789
    : 1.729
  );

  const points: PriceDataPoint[] = [];
  let currentPrice = base;
  const now = new Date();

  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(now);
    date.setDate(date.getDate() - d);
    date.setHours(12, 0, 0, 0);

    // Day-of-week effect (0=Sun..6=Sat)
    const dow = date.getDay();
    const dowEffect =
      dow === 2 || dow === 3 ? -0.02   // Tue/Wed cheaper
      : dow === 5 || dow === 6 ? 0.015  // Fri/Sat pricier
      : 0;

    // Random walk with mean reversion
    const noise = (Math.random() - 0.5) * 0.03;
    const reversion = (base - currentPrice) * 0.1;
    currentPrice = currentPrice + noise + reversion + dowEffect;

    // Clamp to reasonable range
    currentPrice = Math.max(base - 0.12, Math.min(base + 0.12, currentPrice));

    points.push({
      timestamp: date.toISOString(),
      price: Math.round(currentPrice * 1000) / 1000,
    });
  }

  return points;
}
