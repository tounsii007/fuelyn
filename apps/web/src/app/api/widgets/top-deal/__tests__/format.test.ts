// ============================================================
// Format helpers for the Top-Deal PWA widget BFF.
// These run inside the OS-spawned widget context (no DOM, no
// React), so the tests stay in plain Node — no jsdom needed.
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Station } from '@fuelyn/core';
import {
  buildAddress,
  buildEmpty,
  formatDistance,
  formatPriceDe,
  formatRelative,
  pickCheapest,
  priceFor,
  FUEL_LABELS,
} from '../format';

function makeStation(over: Partial<Station> = {}): Station {
  return {
    id: 's-1',
    name: 'Aral Tankstelle',
    brand: 'Aral',
    street: 'Hauptstraße',
    houseNumber: '12',
    postCode: '10115',
    place: 'Berlin',
    lat: 52.52,
    lng: 13.4,
    dist: 1.234,
    prices: { e10: 1.749, e5: 1.789, diesel: 1.659 },
    isOpen: true,
    ...over,
  };
}

describe('formatPriceDe', () => {
  it('renders 3 fractional digits with comma separator', () => {
    expect(formatPriceDe(1.749)).toBe('1,749');
  });

  it('strips trailing zeros', () => {
    expect(formatPriceDe(1.7)).toBe('1,7');
    expect(formatPriceDe(1.7)).not.toMatch(/0$/);
  });

  it('strips trailing zero+comma when value is integer-ish', () => {
    expect(formatPriceDe(2)).toBe('2');
  });

  it('returns em dash for non-finite input', () => {
    expect(formatPriceDe(Number.NaN)).toBe('—');
    expect(formatPriceDe(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('formatDistance', () => {
  it('shows 1 decimal under 10 km', () => {
    expect(formatDistance(2.4)).toBe('2.4');
    expect(formatDistance(0.7)).toBe('0.7');
  });

  it('rounds to integer at 10 km and above', () => {
    expect(formatDistance(10.4)).toBe('10');
    expect(formatDistance(23.7)).toBe('24');
  });

  it('returns em dash for non-finite input', () => {
    expect(formatDistance(Number.NaN)).toBe('—');
  });
});

describe('formatRelative', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders "gerade eben" for fresh timestamps in de', () => {
    expect(formatRelative(new Date('2026-05-10T11:59:30Z'), 'de')).toBe('gerade eben');
  });

  it('renders minutes ago in de', () => {
    const out = formatRelative(new Date('2026-05-10T11:56:00Z'), 'de');
    expect(out).toMatch(/4/); // "vor 4 Minuten"
  });

  it('renders minutes ago in en', () => {
    const out = formatRelative(new Date('2026-05-10T11:56:00Z'), 'en');
    expect(out).toMatch(/4/);
    expect(out).toMatch(/min/i);
  });

  it('renders hours ago for >1h gaps', () => {
    const out = formatRelative(new Date('2026-05-10T09:00:00Z'), 'de');
    expect(out).toMatch(/3/);
  });

  it('returns "gerade eben" / "just now" for null timestamp', () => {
    expect(formatRelative(null, 'de')).toBe('gerade eben');
    expect(formatRelative(null, 'en')).toBe('just now');
  });
});

describe('buildAddress', () => {
  it('produces street + house number + postcode + city', () => {
    expect(buildAddress(makeStation())).toBe('Hauptstraße 12, 10115 Berlin');
  });

  it('omits house number when missing', () => {
    expect(buildAddress(makeStation({ houseNumber: '' }))).toBe(
      'Hauptstraße, 10115 Berlin',
    );
  });

  it('handles missing post code', () => {
    expect(buildAddress(makeStation({ postCode: '' }))).toBe(
      'Hauptstraße 12, Berlin',
    );
  });

  it('returns just the street when city info is empty', () => {
    expect(buildAddress(makeStation({ postCode: '', place: '' }))).toBe(
      'Hauptstraße 12',
    );
  });
});

describe('priceFor / pickCheapest', () => {
  it('returns null for missing or zero prices', () => {
    expect(priceFor(makeStation({ prices: { e10: null, e5: null, diesel: null } }), 'e10')).toBeNull();
    expect(priceFor(makeStation({ prices: { e10: 0, e5: null, diesel: null } }), 'e10')).toBeNull();
  });

  it('picks the lowest-price open station', () => {
    const cheap = makeStation({ id: 'a', prices: { e10: 1.71, e5: null, diesel: null } });
    const mid = makeStation({ id: 'b', prices: { e10: 1.74, e5: null, diesel: null } });
    const dear = makeStation({ id: 'c', prices: { e10: 1.79, e5: null, diesel: null } });
    expect(pickCheapest([dear, mid, cheap], 'e10')?.id).toBe('a');
  });

  it('skips closed stations even if cheapest', () => {
    const closedCheap = makeStation({ id: 'closed', isOpen: false, prices: { e10: 1.5, e5: null, diesel: null } });
    const open = makeStation({ id: 'open', prices: { e10: 1.7, e5: null, diesel: null } });
    expect(pickCheapest([closedCheap, open], 'e10')?.id).toBe('open');
  });

  it('returns null when nothing has a valid price', () => {
    const noPrice = makeStation({ prices: { e10: null, e5: null, diesel: null } });
    expect(pickCheapest([noPrice], 'e10')).toBeNull();
  });
});

describe('buildEmpty', () => {
  it('uses German fallback for de locale', () => {
    const out = buildEmpty('de');
    expect(out.address).toContain('Reichweite');
    expect(out.updatedRelative).toBe('gerade eben');
    expect(out.deepLink).toBe('/?source=widget-top-deal');
  });

  it('uses English fallback for en locale', () => {
    const out = buildEmpty('en');
    expect(out.address).toContain('No station');
    expect(out.updatedRelative).toBe('just now');
  });
});

describe('FUEL_LABELS', () => {
  it('has labels for all 3 fuel types', () => {
    expect(FUEL_LABELS.e10).toBe('E10');
    expect(FUEL_LABELS.e5).toMatch(/E5/);
    expect(FUEL_LABELS.diesel).toBe('Diesel');
  });
});
