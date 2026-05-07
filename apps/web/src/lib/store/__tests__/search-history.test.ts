// @vitest-environment jsdom

// ============================================================
// addSearchHistory — dedupe under realistic Nominatim-roundtrip noise.
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../app-store';

describe('addSearchHistory', () => {
  beforeEach(() => {
    useAppStore.getState().clearSearchHistory();
  });

  function add(label: string, lat: number, lng: number) {
    useAppStore.getState().addSearchHistory({
      lat,
      lng,
      label,
      timestamp: new Date().toISOString(),
    });
  }

  it('coalesces two identical labels (case-insensitive trim) regardless of coord drift', () => {
    add('Marburg', 50.8021, 8.7666);
    // Slightly different coords (Nominatim retry can drift ~1 m)
    add('Marburg', 50.8022, 8.7667);
    add(' marburg ', 50.8023, 8.7668);
    add('MARBURG', 50.8024, 8.7669);

    const history = useAppStore.getState().searchHistory;
    expect(history).toHaveLength(1);
    // The newest insertion wins — most recent coords kept
    expect(history[0]?.lat).toBe(50.8024);
  });

  it('coalesces two entries that round to the same 100 m bucket even if labels differ', () => {
    add('Hauptstraße 12, 35037 Marburg', 50.80201, 8.76601);
    add('Hauptstraße 14, 35037 Marburg', 50.80205, 8.76610);

    const history = useAppStore.getState().searchHistory;
    // Both round to (50.802, 8.766) → same bucket → one entry kept
    expect(history).toHaveLength(1);
    // The newer one (with "14") wins
    expect(history[0]?.label).toContain('14');
  });

  it('keeps two entries when both labels and coord-buckets differ', () => {
    add('Hauptstraße 12, 35037 Marburg', 50.802, 8.766);
    add('Bahnhofstraße 5, 35037 Marburg', 50.815, 8.774);
    add('Berlin Mitte', 52.520, 13.405);

    const history = useAppStore.getState().searchHistory;
    expect(history).toHaveLength(3);
    expect(history.map((h) => h.label)).toEqual([
      'Berlin Mitte',
      'Bahnhofstraße 5, 35037 Marburg',
      'Hauptstraße 12, 35037 Marburg',
    ]);
  });

  it('drops invalid entries (NaN coords, blank labels)', () => {
    add('valid', 50.8, 8.7);
    add('', 51.0, 9.0);
    add('also valid', NaN, 9.0);
    add('  ', 52.0, 10.0);
    add('proper', 53.0, 11.0);

    const labels = useAppStore.getState().searchHistory.map((h) => h.label);
    expect(labels).toEqual(['proper', 'valid']);
  });

  it('caps at the configured max length (10) — oldest evicted first', () => {
    for (let i = 0; i < 15; i++) {
      // Distinct coords + labels so nothing dedupes.
      add(`Place ${i}`, 50 + i * 0.1, 10 + i * 0.1);
    }
    const history = useAppStore.getState().searchHistory;
    expect(history).toHaveLength(10);
    // Newest first
    expect(history[0]?.label).toBe('Place 14');
    expect(history[9]?.label).toBe('Place 5');
  });

  it('clearSearchHistory wipes the list', () => {
    add('A', 50, 8);
    add('B', 51, 9);
    expect(useAppStore.getState().searchHistory).toHaveLength(2);
    useAppStore.getState().clearSearchHistory();
    expect(useAppStore.getState().searchHistory).toHaveLength(0);
  });
});
