// @vitest-environment jsdom

// ============================================================
// BorderCrossingCard — "tank im Ausland" advisory. Renders only
// when a user location is known and a neighbouring country clears
// the worthwhile threshold. With no location it stays hidden; a
// Trier location (≈30 km from Luxembourg) with diesel selected
// surfaces the labelled section. The live-price effect is premium-
// gated and never fires for a free user, so no network is touched.
// Identity translations; real store + real core border engine.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useAppStore } from '@/lib/store/app-store';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { BorderCrossingCard } from '../intelligence/BorderCrossingCard';

describe('BorderCrossingCard', () => {
  beforeEach(() => {
    useAppStore.setState((s) => ({
      userLocation: null,
      subscription: { status: 'free', plan: null },
      vehicle: null,
      filter: { ...s.filter, fuelType: 'diesel' },
    }));
  });
  afterEach(() => cleanup());

  it('renders nothing when no user location is known', () => {
    const { container } = render(<BorderCrossingCard />);
    expect(container.firstChild).toBeNull();
  });

  it('surfaces the border hint for a Trier user buying diesel', () => {
    // Trier ≈ 30 km from Wasserbillig (LU) → Luxembourg is the
    // worthwhile neighbour for diesel.
    useAppStore.setState({ userLocation: { lat: 49.7596, lng: 6.6439 } });
    render(<BorderCrossingCard />);
    expect(screen.getByRole('region', { name: 'borderCrossing.eyebrow' })).toBeInTheDocument();
    expect(screen.getByText('borderCrossing.eyebrow')).toBeInTheDocument();
  });
});
