// @vitest-environment jsdom

// ============================================================
// SmartFilterChips — client-side quick-filter chip bar + the pure
// `applySmartChips` predicate that backs it.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { Station, StationRecommendation } from '@fuelyn/core';
import { SmartFilterChips, applySmartChips, type SmartFilterId } from '../stations/SmartFilterChips';

afterEach(() => cleanup());

const station = (over: Partial<Station>): Station => ({
  id: 's',
  name: 'Test',
  brand: 'Aral',
  street: 'Hauptstr.',
  houseNumber: '1',
  postCode: '60311',
  place: 'Frankfurt',
  lat: 50,
  lng: 8,
  dist: 1,
  prices: { diesel: null, e5: null, e10: 1.7 },
  isOpen: true,
  ...over,
});

const rec = (
  over: Partial<Station>,
  reachabilityStatus: StationRecommendation['reachabilityStatus'] = 'safe',
): StationRecommendation => ({
  station: station(over),
  scores: { price: 0.5, distance: 0.5, reachability: 1, openStatus: 1, favorite: 0, overall: 0.6 },
  reachabilityStatus,
  estimatedFuelCost: 0,
  estimatedDriveTime: 0,
  rank: 1,
  isBestOption: false,
  reasons: [],
});

const RECS: StationRecommendation[] = [
  rec({ brand: 'Aral', isOpen: true, prices: { diesel: null, e5: null, e10: 1.6 } }, 'safe'),
  rec({ brand: 'Shell', isOpen: false, prices: { diesel: null, e5: null, e10: 1.9 } }, 'tight'),
  rec({ brand: 'Aral', isOpen: true, prices: { diesel: null, e5: null, e10: 1.7 } }, 'safe'),
];

describe('SmartFilterChips', () => {
  it('renders the core chips inside a labelled toolbar', () => {
    render(<SmartFilterChips recommendations={RECS} active={new Set()} onToggle={vi.fn()} fuelType="e10" />);
    expect(screen.getByRole('toolbar', { name: 'Schnellfilter' })).toBeInTheDocument();
    ['Geöffnet', 'Top 3', '≤ Markt-⌀', 'Sicher'].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('only shows brand chips for brands present in the cohort', () => {
    render(<SmartFilterChips recommendations={RECS} active={new Set()} onToggle={vi.fn()} fuelType="e10" />);
    expect(screen.getByText('Aral')).toBeInTheDocument();
    expect(screen.getByText('Shell')).toBeInTheDocument();
    expect(screen.queryByText('Esso')).toBeNull();
    expect(screen.queryByText('TotalEnergies')).toBeNull();
  });

  it('calls onToggle with the chip id when clicked', () => {
    const onToggle = vi.fn();
    render(<SmartFilterChips recommendations={RECS} active={new Set()} onToggle={onToggle} fuelType="e10" />);
    fireEvent.click(screen.getByText('Geöffnet'));
    expect(onToggle).toHaveBeenCalledWith('open');
  });

  it('marks active chips via aria-pressed and offers a reset', () => {
    const onClear = vi.fn();
    render(
      <SmartFilterChips
        recommendations={RECS}
        active={new Set<SmartFilterId>(['open'])}
        onToggle={vi.fn()}
        fuelType="e10"
        onClear={onClear}
      />,
    );
    expect(screen.getByText('Geöffnet').closest('button')?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByText('Zurücksetzen'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('applySmartChips', () => {
  it('returns the input untouched when no chips are active', () => {
    expect(applySmartChips(RECS, new Set(), 'e10')).toBe(RECS);
  });

  it('keeps only open stations for the "open" chip', () => {
    const out = applySmartChips(RECS, new Set<SmartFilterId>(['open']), 'e10');
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.station.isOpen)).toBe(true);
  });

  it('keeps only safely-reachable stations for the "safe" chip', () => {
    const out = applySmartChips(RECS, new Set<SmartFilterId>(['safe']), 'e10');
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.reachabilityStatus === 'safe')).toBe(true);
  });

  it('slices to the first three for the "top3" chip', () => {
    const many = [...RECS, rec({ brand: 'Esso' }), rec({ brand: 'JET' })];
    expect(applySmartChips(many, new Set<SmartFilterId>(['top3']), 'e10')).toHaveLength(3);
  });
});
