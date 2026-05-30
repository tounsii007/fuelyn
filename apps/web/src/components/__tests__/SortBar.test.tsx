// @vitest-environment jsdom

// ============================================================
// SortBar — sort-mode pills + filter trigger + active-filter chips,
// all wired through the Zustand app store.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useAppStore } from '@/lib/store/app-store';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { SortBar } from '../stations/SortBar';

describe('SortBar', () => {
  beforeEach(() => {
    useAppStore.setState({
      sortMode: 'recommended',
      filter: { fuelType: 'e10', radiusKm: 5, onlyOpen: false, brands: [], priceMin: null, priceMax: null },
    });
  });
  afterEach(() => cleanup());

  it('renders all four sort options', () => {
    render(<SortBar />);
    ['Empfohlen', 'Günstigste', 'Nächste', 'Geöffnet'].forEach((label) => {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
    });
  });

  it('marks the active mode and switches sortMode on click', () => {
    render(<SortBar />);
    const cheapest = screen.getByRole('button', { name: /Günstigste/ });
    expect(cheapest.className).not.toMatch(/bg-brand-600/);
    fireEvent.click(cheapest);
    expect(useAppStore.getState().sortMode).toBe('cheapest');
  });

  it('opens the filter sheet via the filter button', () => {
    render(<SortBar />);
    fireEvent.click(screen.getByRole('button', { name: 'miscAria.filterOpen' }));
    expect(useAppStore.getState().isFilterOpen).toBe(true);
  });

  it('renders count badges: — for null, 99+ over 99, raw number otherwise', () => {
    render(<SortBar counts={{ open: null, cheapest: 150, nearest: 4 }} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('99+')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('shows removable active-filter chips reflecting store state', () => {
    useAppStore.setState({
      filter: { fuelType: 'e10', radiusKm: 5, onlyOpen: true, brands: ['Aral'], priceMin: null, priceMax: null },
    });
    render(<SortBar />);
    expect(screen.getByRole('button', { name: 'Filter "Aral" entfernen' })).toBeInTheDocument();

    const openChip = screen.getByRole('button', { name: 'Filter "Nur geöffnet" entfernen' });
    fireEvent.click(openChip);
    expect(useAppStore.getState().filter.onlyOpen).toBe(false);
  });
});
