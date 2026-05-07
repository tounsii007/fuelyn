// ============================================================
// Fuelyn — Formatting Utilities
// ============================================================

/**
 * Format fuel price for display.
 * German convention: "1,459 €" with 3 decimal places.
 * The third decimal is displayed as superscript in the UI.
 */
export function formatPrice(price: number | null): string {
  if (price == null) return '—';
  return price.toFixed(3).replace('.', ',');
}

/**
 * Split price into main part and trailing digit for styled rendering.
 * e.g., 1.459 → { main: "1,45", trailing: "9", currency: "€" }
 */
export function splitPrice(price: number | null): {
  main: string;
  trailing: string;
  currency: string;
} {
  if (price == null) {
    return { main: '—', trailing: '', currency: '' };
  }
  const formatted = price.toFixed(3).replace('.', ',');
  return {
    main: formatted.slice(0, -1),
    trailing: formatted.slice(-1),
    currency: '€',
  };
}

/**
 * Format distance in km for display.
 */
export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(1)} km`;
}

/**
 * Format drive time in minutes.
 */
export function formatDriveTime(minutes: number): string {
  if (minutes < 1) return '< 1 Min.';
  if (minutes < 60) return `${Math.round(minutes)} Min.`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

/**
 * Format fuel cost in EUR.
 */
export function formatCurrency(amount: number): string {
  return `${amount.toFixed(2).replace('.', ',')} €`;
}

/**
 * Format consumption value.
 */
export function formatConsumption(litersPerHundredKm: number): string {
  return `${litersPerHundredKm.toFixed(1)} L/100 km`;
}

/**
 * Format range in km.
 */
export function formatRange(km: number): string {
  return `${Math.round(km)} km`;
}

/**
 * Generate a street address string.
 */
export function formatAddress(
  street: string,
  houseNumber: string,
  postCode: string,
  place: string,
): string {
  const streetLine = houseNumber ? `${street} ${houseNumber}` : street;
  return `${streetLine}, ${postCode} ${place}`;
}
