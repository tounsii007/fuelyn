// @vitest-environment jsdom

// ============================================================
// AchievementsPanel — grid of badge cards derived live from store
// data (favorites / search history / price history). On a fresh
// store every stat is zero, so all badges sit in the "Noch zu
// freischalten" section and none are earned. German copy is
// hardcoded, so no translation mock is needed.
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useAppStore } from '@/lib/store/app-store';
import { ACHIEVEMENTS } from '@/lib/achievements';

import { AchievementsPanel } from '../achievements/AchievementsPanel';

describe('AchievementsPanel', () => {
  beforeEach(() => {
    useAppStore.setState({ favorites: [], searchHistory: [], priceHistory: [] });
  });
  afterEach(() => cleanup());

  it('shows the heading and a zero earned-count on a fresh store', () => {
    render(<AchievementsPanel />);
    expect(screen.getByRole('heading', { name: 'Achievements' })).toBeInTheDocument();
    expect(screen.getByText(/0 \/ \d+ freigeschaltet/)).toBeInTheDocument();
  });

  it('lists every achievement as an in-progress card', () => {
    render(<AchievementsPanel />);
    expect(screen.getByText('Noch zu freischalten')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(ACHIEVEMENTS.length);
  });
});
