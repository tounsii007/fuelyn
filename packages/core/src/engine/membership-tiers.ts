// ============================================================
// Fuelyn — Brand membership / loyalty card discounts
//
// Models the major German brand-loyalty programmes. When the
// user has activated a card in their profile, station list +
// detail views show the EFFECTIVE per-liter price (sticker
// minus discount) instead of just the raw sticker.
//
// We model:
//   - Aral Klubkarte           (~2 ct/L, fuel/charging)
//   - Shell ClubSmart          (~3 ct/L on E5/E10/Diesel)
//   - Esso Esso Card           (~2 ct/L)
//   - Total Card               (~2 ct/L)
//   - DKV Mobility / UTA / etc → fleet cards, separate flow
//
// Discounts are ESTIMATES based on publicly advertised tiers.
// The constants live here so they're easy to tune as programs
// change without touching UI code.
// ============================================================

import type { FuelType } from '../domain/types';

export type MembershipId =
  | 'aral-klubkarte'
  | 'shell-clubsmart'
  | 'esso-card'
  | 'total-card'
  | 'jet-jetpoints'
  | 'star-prime';

export interface MembershipDiscount {
  id: MembershipId;
  /** Brand name as it usually appears in a station's brand field. */
  brand: string;
  /**
   * Per-fuel discount in € (positive = cheaper for the user).
   * Some programmes only discount specific fuels — undefined
   * means "no discount applies for this fuel".
   */
  perFuel: Partial<Record<FuelType, number>>;
}

export const MEMBERSHIPS: readonly MembershipDiscount[] = [
  {
    id: 'aral-klubkarte',
    brand: 'Aral',
    perFuel: { diesel: 0.02, e5: 0.02, e10: 0.02 },
  },
  {
    id: 'shell-clubsmart',
    brand: 'Shell',
    perFuel: { diesel: 0.03, e5: 0.03, e10: 0.03 },
  },
  {
    id: 'esso-card',
    brand: 'Esso',
    perFuel: { diesel: 0.02, e5: 0.02, e10: 0.02 },
  },
  {
    id: 'total-card',
    brand: 'Total',
    perFuel: { diesel: 0.025, e5: 0.025, e10: 0.025 },
  },
  {
    id: 'jet-jetpoints',
    brand: 'Jet',
    perFuel: { diesel: 0.01, e5: 0.01, e10: 0.01 },
  },
  {
    id: 'star-prime',
    brand: 'Star',
    perFuel: { diesel: 0.015, e5: 0.015, e10: 0.015 },
  },
];

const BY_BRAND = new Map<string, MembershipDiscount>(
  MEMBERSHIPS.map((m) => [m.brand.toLowerCase(), m]),
);
const BY_ID = new Map<MembershipId, MembershipDiscount>(
  MEMBERSHIPS.map((m) => [m.id, m]),
);

/**
 * Look up a membership by id.
 */
export function getMembershipById(id: MembershipId): MembershipDiscount | null {
  return BY_ID.get(id) ?? null;
}

/**
 * Look up the membership that matches a station's brand.
 * Brand match is case-insensitive and trimmed.
 */
export function findMembershipForBrand(brand: string | undefined | null): MembershipDiscount | null {
  if (!brand) return null;
  return BY_BRAND.get(brand.trim().toLowerCase()) ?? null;
}

/**
 * Compute the effective price after applying any active
 * membership for the station's brand.
 *
 * @param stickerPrice   The raw posted price in € per liter.
 * @param fuel           The fuel being purchased.
 * @param stationBrand   Station's brand string (matches MEMBERSHIPS.brand).
 * @param activeIds      The set of membership IDs the user has.
 * @returns              { effective, discount, applied } — `applied`
 *                       is the membership that matched (null when
 *                       none did).
 */
export function applyMembership(
  stickerPrice: number,
  fuel: FuelType,
  stationBrand: string | undefined | null,
  activeIds: readonly MembershipId[],
): { effective: number; discount: number; applied: MembershipDiscount | null } {
  if (!Number.isFinite(stickerPrice) || stickerPrice <= 0) {
    return { effective: stickerPrice, discount: 0, applied: null };
  }
  if (activeIds.length === 0) {
    return { effective: stickerPrice, discount: 0, applied: null };
  }
  const m = findMembershipForBrand(stationBrand);
  if (!m || !activeIds.includes(m.id)) {
    return { effective: stickerPrice, discount: 0, applied: null };
  }
  const perL = m.perFuel[fuel] ?? 0;
  if (perL <= 0) {
    return { effective: stickerPrice, discount: 0, applied: null };
  }
  // Floor at €0.50/L so a configuration mistake can't go negative.
  const effective = Math.max(0.5, stickerPrice - perL);
  return {
    effective: Math.round(effective * 1000) / 1000,
    discount: Math.round(perL * 1000) / 1000,
    applied: m,
  };
}
