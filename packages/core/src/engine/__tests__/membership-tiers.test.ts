import { describe, it, expect } from 'vitest';
import {
  MEMBERSHIPS,
  applyMembership,
  findMembershipForBrand,
  getMembershipById,
} from '../membership-tiers';

describe('MEMBERSHIPS catalog', () => {
  it('exposes the major German brand programmes', () => {
    const brands = MEMBERSHIPS.map((m) => m.brand);
    expect(brands).toContain('Aral');
    expect(brands).toContain('Shell');
    expect(brands).toContain('Esso');
    expect(brands).toContain('Total');
    expect(brands).toContain('Jet');
  });

  it('every membership carries discounts for all 3 fuel types', () => {
    for (const m of MEMBERSHIPS) {
      expect(m.perFuel.diesel).toBeGreaterThan(0);
      expect(m.perFuel.e5).toBeGreaterThan(0);
      expect(m.perFuel.e10).toBeGreaterThan(0);
    }
  });
});

describe('findMembershipForBrand', () => {
  it('matches case-insensitively', () => {
    expect(findMembershipForBrand('ARAL')?.id).toBe('aral-klubkarte');
    expect(findMembershipForBrand('aral')?.id).toBe('aral-klubkarte');
  });

  it('trims whitespace', () => {
    expect(findMembershipForBrand('  Shell  ')?.id).toBe('shell-clubsmart');
  });

  it('returns null for unknown brands', () => {
    expect(findMembershipForBrand('UnknownBrand')).toBeNull();
    expect(findMembershipForBrand('')).toBeNull();
    expect(findMembershipForBrand(null)).toBeNull();
    expect(findMembershipForBrand(undefined)).toBeNull();
  });
});

describe('getMembershipById', () => {
  it('returns the matching membership', () => {
    expect(getMembershipById('shell-clubsmart')?.brand).toBe('Shell');
  });
});

describe('applyMembership', () => {
  it('subtracts the membership discount when card is active', () => {
    const r = applyMembership(1.799, 'diesel', 'Aral', ['aral-klubkarte']);
    expect(r.effective).toBeCloseTo(1.779, 3);
    expect(r.discount).toBe(0.02);
    expect(r.applied?.id).toBe('aral-klubkarte');
  });

  it('returns sticker price when no card is active', () => {
    const r = applyMembership(1.799, 'diesel', 'Aral', []);
    expect(r.effective).toBe(1.799);
    expect(r.discount).toBe(0);
    expect(r.applied).toBeNull();
  });

  it("returns sticker price when active card doesn't match station brand", () => {
    const r = applyMembership(1.799, 'diesel', 'Aral', ['shell-clubsmart']);
    expect(r.effective).toBe(1.799);
    expect(r.applied).toBeNull();
  });

  it('handles invalid input (NaN/0/neg) gracefully', () => {
    expect(applyMembership(NaN, 'diesel', 'Aral', ['aral-klubkarte']).effective).toBeNaN();
    expect(applyMembership(0, 'diesel', 'Aral', ['aral-klubkarte']).effective).toBe(0);
    expect(applyMembership(-1, 'diesel', 'Aral', ['aral-klubkarte']).effective).toBe(-1);
  });

  it('floors at €0.50/L to prevent negative effective prices', () => {
    const r = applyMembership(0.55, 'diesel', 'Aral', ['aral-klubkarte']);
    expect(r.effective).toBe(0.53);
    // €0.55 - €0.02 = €0.53, still above floor
    const fl = applyMembership(0.50, 'diesel', 'Aral', ['aral-klubkarte']);
    expect(fl.effective).toBe(0.5); // capped
  });
});
