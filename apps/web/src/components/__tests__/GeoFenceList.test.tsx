// @vitest-environment jsdom

// ============================================================
// GeoFenceList — geo-fenced price-alert manager. Lists fences from
// the Zustand store with a toggle + delete per card, and an empty
// state. The notification-permission helper + toast are stubbed;
// jsdom exposes no Notification API so that prompt stays hidden.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useAppStore } from '@/lib/store/app-store';
import type { GeoFenceState } from '@/lib/store/app-store';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: vi.fn() }) }));
vi.mock('@/lib/geo/use-geo-fence-watcher', () => ({ requestNotificationPermission: vi.fn() }));

import { GeoFenceList } from '../alerts/GeoFenceList';

const fence = (over: Partial<GeoFenceState> = {}): GeoFenceState => ({
  id: 'f1',
  label: 'Zuhause',
  stationId: 'st1',
  stationName: 'Aral Hauptstr.',
  center: { lat: 50, lng: 8 },
  radiusKm: 2,
  fuelType: 'e10',
  maxPrice: 1.75,
  enabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('GeoFenceList', () => {
  beforeEach(() => {
    useAppStore.setState({ geoFences: [] });
  });
  afterEach(() => cleanup());

  it('shows the empty state when no fences exist', () => {
    render(<GeoFenceList />);
    expect(screen.getByText('geoFence.sectionTitle')).toBeInTheDocument();
    expect(screen.getByText('geoFence.newCta')).toBeInTheDocument();
    expect(screen.getByText('geoFence.emptyTitle')).toBeInTheDocument();
    // jsdom has no Notification API → permission resolves to "unsupported",
    // so the enable-notifications prompt is not rendered.
    expect(screen.queryByText('geoFence.enableCta')).toBeNull();
  });

  it('lists each fence with its fuel label and active badge', () => {
    useAppStore.setState({ geoFences: [fence({ label: 'Zuhause', fuelType: 'e10', enabled: true })] });
    render(<GeoFenceList />);
    expect(screen.getByText('Zuhause')).toBeInTheDocument();
    expect(screen.getByText(/Super E10/)).toBeInTheDocument();
    expect(screen.getByText('geoFence.badgeActive')).toBeInTheDocument();
  });

  it('toggles a fence through the store action', () => {
    useAppStore.setState({ geoFences: [fence({ id: 'f1', enabled: true })] });
    render(<GeoFenceList />);
    fireEvent.click(screen.getByRole('switch'));
    expect(useAppStore.getState().geoFences[0]?.enabled).toBe(false);
  });

  it('removes a fence via the delete control', () => {
    useAppStore.setState({ geoFences: [fence({ id: 'f1' })] });
    render(<GeoFenceList />);
    fireEvent.click(screen.getByLabelText('geoFence.deleteAria'));
    expect(useAppStore.getState().geoFences).toHaveLength(0);
  });
});
