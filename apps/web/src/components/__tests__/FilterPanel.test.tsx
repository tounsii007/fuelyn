// @vitest-environment jsdom

// ============================================================
// FilterPanel — the bottom-sheet station filter. Hidden unless
// the store's isFilterOpen flag is set. Open, it shows the title,
// reset/apply actions, and a brand chip per known brand. Picking
// a brand and applying writes it into filter.brands and closes
// the sheet; reset clears the brands and closes. Identity
// translations; real store (real setFilter / setFilterOpen).
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useAppStore } from '@/lib/store/app-store';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { FilterPanel } from '../stations/FilterPanel';

describe('FilterPanel', () => {
  beforeEach(() => {
    useAppStore.setState((s) => ({
      isFilterOpen: false,
      filter: { ...s.filter, brands: [], onlyOpen: false, priceMin: null, priceMax: null },
      selectedEnergyTypes: ['diesel', 'e5', 'e10'],
      selectedStationTypes: [],
      selectedConnectorTypes: [],
      selectedChargingTypes: [],
      selectedMinPowerKW: null,
    }));
  });
  afterEach(() => cleanup());

  it('renders nothing while the sheet is closed', () => {
    const { container } = render(<FilterPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the filter sheet when opened', () => {
    useAppStore.setState({ isFilterOpen: true });
    render(<FilterPanel />);
    expect(screen.getByRole('heading', { name: 'filterPanel.title' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'filterPanel.reset' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /filterPanel\.apply/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aral' })).toBeInTheDocument();
  });

  it('applies a selected brand into the store filter and closes', () => {
    useAppStore.setState({ isFilterOpen: true });
    render(<FilterPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Aral' }));
    fireEvent.click(screen.getByRole('button', { name: /filterPanel\.apply/ }));
    expect(useAppStore.getState().filter.brands).toContain('Aral');
    expect(useAppStore.getState().isFilterOpen).toBe(false);
  });

  it('reset clears the brands and closes the sheet', () => {
    useAppStore.setState((s) => ({ isFilterOpen: true, filter: { ...s.filter, brands: ['Aral'] } }));
    render(<FilterPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'filterPanel.reset' }));
    expect(useAppStore.getState().isFilterOpen).toBe(false);
    expect(useAppStore.getState().filter.brands).toEqual([]);
  });
});
