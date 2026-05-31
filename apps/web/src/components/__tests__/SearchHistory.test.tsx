// @vitest-environment jsdom

// ============================================================
// SearchHistory — "Letzte Suchen" chip strip driven by the Zustand
// store (recenter on pick, clear-all).
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useAppStore } from '@/lib/store/app-store';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { SearchHistory } from '../stations/SearchHistory';

const entry = (label: string, lat: number, lng: number) => ({
  lat,
  lng,
  label,
  timestamp: new Date().toISOString(),
});

describe('SearchHistory', () => {
  beforeEach(() => {
    useAppStore.setState({ searchHistory: [], userLocation: null });
  });
  afterEach(() => cleanup());

  it('renders nothing when the history is empty', () => {
    const { container } = render(<SearchHistory />);
    expect(container.firstChild).toBeNull();
  });

  it('lists saved searches under a heading', () => {
    useAppStore.setState({
      searchHistory: [entry('Frankfurt', 50.1, 8.6), entry('Berlin', 52.5, 13.4)],
    });
    render(<SearchHistory />);
    expect(screen.getByText('searchHistory.title')).toBeInTheDocument();
    expect(screen.getByText('Frankfurt')).toBeInTheDocument();
    expect(screen.getByText('Berlin')).toBeInTheDocument();
  });

  it('recenters the user location on the picked entry', () => {
    useAppStore.setState({ searchHistory: [entry('Frankfurt', 50.1, 8.6)] });
    render(<SearchHistory />);
    fireEvent.click(screen.getByText('Frankfurt'));
    expect(useAppStore.getState().userLocation).toEqual({ lat: 50.1, lng: 8.6 });
  });

  it('empties the history via the clear control', () => {
    useAppStore.setState({ searchHistory: [entry('Frankfurt', 50.1, 8.6)] });
    render(<SearchHistory />);
    fireEvent.click(screen.getByText('searchHistory.clearLabel'));
    expect(useAppStore.getState().searchHistory).toHaveLength(0);
  });
});
