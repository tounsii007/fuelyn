// @vitest-environment jsdom

// ============================================================
// BrandQuickFilter — covers the iter-31 component plus the
// commit 6137eeb spacing regression.
//
// The layout bug: `pb-2 -mt-1` pulled the chip row up 4px into
// the SortBar territory, so the active sort tab's badge
// ("Geöffnet 4") visually collided with the brand chips below.
// The fix swapped to `pt-1.5 pb-3` (sane positive spacing) and
// added a hairline border-t separator.
//
// We test both the runtime behaviour (top-N brands, toggle
// filter) AND the className shape so a future "let me just
// re-tighten the spacing" edit can't reintroduce the overlap.
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { StationRecommendation } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';
import { BrandQuickFilter } from '../stations/BrandQuickFilter';

function makeRec(id: string, brand: string): StationRecommendation {
  return {
    station: {
      id,
      name: `${brand} Test`,
      brand,
      street: 'Teststraße',
      houseNumber: '1',
      postCode: '35037',
      place: 'Marburg',
      lat: 50.8,
      lng: 8.77,
      dist: 1.0,
      prices: { diesel: null, e5: null, e10: 1.799 },
      isOpen: true,
    },
    scores: {
      overall: 0.5,
      price: 0.5,
      distance: 0.5,
      reachability: 1,
      openStatus: 1,
      favorite: 0,
    },
    reachabilityStatus: 'safe',
    estimatedFuelCost: 0,
    estimatedDriveTime: 1,
    rank: 1,
    isBestOption: false,
    reasons: [],
  };
}

describe('BrandQuickFilter — runtime behaviour', () => {
  beforeEach(() => {
    useAppStore.setState({
      filter: {
        fuelType: 'e10',
        radiusKm: 5,
        onlyOpen: false,
        brands: [],
        priceMin: null,
        priceMax: null,
      },
    });
  });

  afterEach(() => cleanup());

  it('returns null when no brands are present in the candidate set', () => {
    const { container } = render(<BrandQuickFilter recommendations={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when all stations are brand-less (whitespace stripped)', () => {
    const { container } = render(
      <BrandQuickFilter
        recommendations={[
          makeRec('s1', '   '),
          makeRec('s2', ''),
        ]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the top brands sorted by station count, with their counts', () => {
    render(
      <BrandQuickFilter
        recommendations={[
          makeRec('s1', 'Aral'),
          makeRec('s2', 'Aral'),
          makeRec('s3', 'Aral'),
          makeRec('s4', 'Esso'),
          makeRec('s5', 'Esso'),
          makeRec('s6', 'Shell'),
        ]}
      />,
    );

    // The label "Marken" is always rendered before the chips.
    expect(screen.getByText(/Marken/)).toBeInTheDocument();

    const chips = screen.getAllByRole('button');
    expect(chips.length).toBe(3);

    // First chip = top-count brand (Aral, 3 stations).
    expect(chips[0]).toHaveTextContent('Aral');
    expect(chips[0]).toHaveTextContent('3');
    expect(chips[1]).toHaveTextContent('Esso');
    expect(chips[1]).toHaveTextContent('2');
    expect(chips[2]).toHaveTextContent('Shell');
    expect(chips[2]).toHaveTextContent('1');
  });

  it('caps the rendered chips to maxBrands', () => {
    const recs = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].map(
      (b, i) => makeRec(`s${i}`, b),
    );
    render(<BrandQuickFilter recommendations={recs} maxBrands={3} />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('clicking a chip ADDS the brand to filter.brands when not active', () => {
    render(
      <BrandQuickFilter
        recommendations={[makeRec('s1', 'Aral'), makeRec('s2', 'Esso')]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Aral/ }));

    expect(useAppStore.getState().filter.brands).toEqual(['Aral']);
  });

  it('clicking an already-active chip REMOVES the brand from filter.brands', () => {
    useAppStore.setState((s) => ({
      filter: { ...s.filter, brands: ['Aral'] },
    }));
    render(
      <BrandQuickFilter
        recommendations={[makeRec('s1', 'Aral'), makeRec('s2', 'Esso')]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Aral/ }));

    expect(useAppStore.getState().filter.brands).toEqual([]);
  });

  it('marks the active brand chip with aria-pressed=true', () => {
    useAppStore.setState((s) => ({
      filter: { ...s.filter, brands: ['Esso'] },
    }));
    render(
      <BrandQuickFilter
        recommendations={[makeRec('s1', 'Aral'), makeRec('s2', 'Esso')]}
      />,
    );

    const aral = screen.getByRole('button', { name: /Aral/ });
    const esso = screen.getByRole('button', { name: /Esso/ });
    expect(aral).toHaveAttribute('aria-pressed', 'false');
    expect(esso).toHaveAttribute('aria-pressed', 'true');
  });
});

// ─── Layout regression — commit 6137eeb ───────────────────────
// The bug was purely visual (no behavioural symptom), so we
// pin it via the rendered className. If anyone re-adds `-mt-1`
// or drops the `border-t` separator, this fails.
describe('BrandQuickFilter — spacing & separator (commit 6137eeb)', () => {
  beforeEach(() => {
    useAppStore.setState({
      filter: {
        fuelType: 'e10',
        radiusKm: 5,
        onlyOpen: false,
        brands: [],
        priceMin: null,
        priceMax: null,
      },
    });
  });

  afterEach(() => cleanup());

  it('does NOT pull itself up into the SortBar with a negative margin', () => {
    render(
      <BrandQuickFilter recommendations={[makeRec('s1', 'Aral')]} />,
    );
    // aria-label now ties to t('filter.brands') = 'Marken' in the
    // de locale (which the test runs in by default).
    const root = screen.getByRole('group', { name: 'Marken' });
    // The whole point of the fix: the negative top margin is gone.
    expect(root.className).not.toMatch(/(?<![\w-])-mt-/);
  });

  it('uses positive top + bottom padding so the row sits cleanly under the SortBar', () => {
    render(
      <BrandQuickFilter recommendations={[makeRec('s1', 'Aral')]} />,
    );
    // aria-label now ties to t('filter.brands') = 'Marken' in the
    // de locale (which the test runs in by default).
    const root = screen.getByRole('group', { name: 'Marken' });
    expect(root.className).toMatch(/\bpt-1\.5\b/);
    expect(root.className).toMatch(/\bpb-3\b/);
  });

  it('renders a hairline border-t separator above the chip row for visual hierarchy', () => {
    render(
      <BrandQuickFilter recommendations={[makeRec('s1', 'Aral')]} />,
    );
    // aria-label now ties to t('filter.brands') = 'Marken' in the
    // de locale (which the test runs in by default).
    const root = screen.getByRole('group', { name: 'Marken' });
    expect(root.className).toMatch(/\bborder-t\b/);
  });
});
