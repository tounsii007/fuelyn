// @vitest-environment jsdom

// ============================================================
// SettingsPage — the extended settings screen. We exercise the
// three controls that write straight through to the real store:
// the theme tiles (setTheme → settings.theme), the default-fuel
// tiles (updateSettings → settings.defaultFuelType, labelled by
// core's FUEL_TYPE_LABELS), and the search-radius slider
// (updateSettings → settings.defaultRadiusKm). The six feature
// children (imports, billing, dashboard, account-delete,
// membership) are stubbed to null so the spec stays a focused unit
// — several of them pull a Toast provider / network we don't want
// here. next/link is stubbed to a plain <a>; identity translations
// expose copy by key, so FUEL_TYPE_LABELS values ("Diesel") render
// literally. Real store via setState/getState.
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
// Feature children are out of scope for this unit — stub to null.
vi.mock('@/components/settings/SpritmonitorImport', () => ({ SpritmonitorImport: () => null }));
vi.mock('@/components/settings/BankCsvImport', () => ({ BankCsvImport: () => null }));
vi.mock('@/components/billing/PremiumStatusCard', () => ({ PremiumStatusCard: () => null }));
vi.mock('@/components/settings/DashboardCustomizer', () => ({ DashboardCustomizer: () => null }));
vi.mock('@/components/settings/AccountDeletePanel', () => ({ AccountDeletePanel: () => null }));
vi.mock('@/components/settings/MembershipPicker', () => ({ MembershipPicker: () => null }));

import { SettingsPage } from '../settings/SettingsPage';

describe('SettingsPage', () => {
  beforeEach(() => {
    useAppStore.setState((s) => ({
      settings: { ...s.settings, theme: 'light', defaultFuelType: 'e5', defaultRadiusKm: 5 },
    }));
  });
  afterEach(() => cleanup());

  it('renders the title and the core controls', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'settings.title' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'settings.themeDark' })).toBeInTheDocument();
    expect(screen.getByLabelText('settings.searchRadius')).toBeInTheDocument();
  });

  it('switches the theme through the store when a tile is clicked', () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'settings.themeDark' }));
    expect(useAppStore.getState().settings.theme).toBe('dark');
  });

  it('persists the chosen default fuel type', () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Diesel' }));
    expect(useAppStore.getState().settings.defaultFuelType).toBe('diesel');
  });

  it('writes the search radius through the slider', () => {
    render(<SettingsPage />);
    fireEvent.change(screen.getByLabelText('settings.searchRadius'), {
      target: { value: '25' },
    });
    expect(useAppStore.getState().settings.defaultRadiusKm).toBe(25);
  });
});
