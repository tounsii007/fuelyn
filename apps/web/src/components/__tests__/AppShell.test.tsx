// @vitest-environment jsdom

// ============================================================
// AppShell — the sticky glass header + global floating chrome that
// wraps every page. We test the behavior that is AppShell's *own*
// (not its already-covered children): the labelled nav landmark and
// brand home link render, the custom fuel / radius PopoverSelects
// open a role="listbox" and write the picked value straight through
// to the real store (setFuelType / setFilter), and the map↔list
// IconButton flips isMapView via toggleView. The triggers are named
// by aria-label (so they read as the picker, not the current value);
// each option is a role="option" button.
//
// Seam mocks only: identity translations; next/link → <a>;
// next/navigation (CompareTray reads usePathname); ThemeProvider's
// useTheme (ThemeQuickToggle needs it and there's no provider here);
// and the floating VoiceCommandButton → null (it owns a speech /
// hydration gate covered by its own spec). NotificationBell and the
// closed MoreMenu render for real against the store.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useAppStore } from '@/lib/store/app-store';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));
vi.mock('next/link', () => ({
  default: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: () => {} }),
}));
// ThemeQuickToggle calls useTheme; there's no ThemeProvider in the
// test tree, so stub the hook while keeping the module's real exports.
vi.mock('@/lib/theme/ThemeProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/theme/ThemeProvider')>()),
  useTheme: () => ({ resolved: 'light', toggle: () => {} }),
}));
// The voice FAB owns a SpeechRecognition + hydration gate of its own.
vi.mock('@/components/voice/VoiceCommandButton', () => ({ VoiceCommandButton: () => null }));

import { AppShell } from '../layout/AppShell';

describe('AppShell', () => {
  beforeEach(() => {
    useAppStore.setState((s) => ({
      filter: { ...s.filter, fuelType: 'e10', radiusKm: 5 },
      isMapView: false,
      compareStationIds: [],
      favorites: [],
    }));
  });
  afterEach(() => cleanup());

  it('renders the nav landmark, brand link, pickers and wraps its children', () => {
    render(
      <AppShell>
        <div>shell-child</div>
      </AppShell>,
    );
    expect(screen.getByRole('navigation', { name: 'appShell.mainNavAria' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'appShell.brandHomeAria' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'appShell.fuelTypeAria' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'appShell.radiusAria' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'appShell.toggleMapView' })).toBeInTheDocument();
    expect(screen.getByText('shell-child')).toBeInTheDocument();
  });

  it('writes the picked fuel type through the store via the fuel popover', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'appShell.fuelTypeAria' }));
    fireEvent.click(screen.getByRole('option', { name: 'Diesel' }));
    expect(useAppStore.getState().filter.fuelType).toBe('diesel');
  });

  it('writes the picked radius through the store via the radius popover', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'appShell.radiusAria' }));
    fireEvent.click(screen.getByRole('option', { name: '10 km' }));
    expect(useAppStore.getState().filter.radiusKm).toBe(10);
  });

  it('toggles the map/list view through the store', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'appShell.toggleMapView' }));
    expect(useAppStore.getState().isMapView).toBe(true);
  });
});
