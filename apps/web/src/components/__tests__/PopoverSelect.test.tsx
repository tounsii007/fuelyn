// @vitest-environment jsdom

// ============================================================
// PopoverSelect — focused tests on the custom dropdown that
// replaced native <select>. Native selects render <option>s with
// OS chrome we can't theme; this component renders themed buttons.
//
// The component is exported only via AppShell, so we drive it
// indirectly by rendering the shell's relevant fragments.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { useAppStore } from '@/lib/store/app-store';

// AppShell pulls in lots of side-effects (zustand, leaflet, theme).
// We only need the popover behaviour, so we extract it via a
// minimal wrapper that imports the named symbols from AppShell.
// To keep the test laser-focused, we re-create a tiny wrapper
// around PopoverSelect by importing the file but only mounting
// the Brand-less header section through React directly.
//
// In practice the easiest approach is to render AppShell and find
// the popover by its accessible name. We mock heavy dependencies
// of AppShell so the test stays fast.

vi.mock('next/link', () => ({
  default: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));

vi.mock('@/components/notifications/NotificationBell', () => ({
  NotificationBell: () => <button aria-label="Benachrichtigungen">Bell</button>,
}));

vi.mock('@/lib/theme/ThemeProvider', () => ({
  useTheme: () => ({ resolved: 'light', toggle: vi.fn(), preference: 'system', setPreference: vi.fn() }),
}));

vi.mock('@/components/ui/ThemeToggle', () => ({
  ThemeToggle: () => <button>theme</button>,
}));

vi.mock('@/components/stations/CompareTray', () => ({
  CompareTray: () => null,
}));

vi.mock('@/components/voice/VoiceCommandButton', () => ({
  VoiceCommandButton: () => null,
}));

import { AppShell } from '../layout/AppShell';

describe('PopoverSelect — fuel-type & radius', () => {
  beforeEach(() => {
    // reset store
    useAppStore.setState({
      filter: { fuelType: 'e10', radiusKm: 5, onlyOpen: false, brands: [], priceMin: null, priceMax: null },
    });
  });

  afterEach(() => cleanup());

  it('renders the fuel type and radius triggers with their selected values', () => {
    render(<AppShell><div /></AppShell>);

    // Two PopoverSelect triggers — distinguish by aria-label
    expect(screen.getByLabelText('Kraftstoffart wählen')).toBeInTheDocument();
    expect(screen.getByLabelText('Suchradius wählen')).toBeInTheDocument();
  });

  it('opens the listbox on click and lists all options', () => {
    render(<AppShell><div /></AppShell>);

    const fuelTrigger = screen.getByLabelText('Kraftstoffart wählen');
    expect(fuelTrigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(fuelTrigger);

    expect(fuelTrigger).toHaveAttribute('aria-expanded', 'true');
    const listbox = screen.getByRole('listbox', { name: 'Kraftstoffart wählen' });
    const options = within(listbox).getAllByRole('option');
    // diesel + e5 + e10 = 3
    expect(options).toHaveLength(3);
  });

  it('selecting an option updates the store and closes the popover', () => {
    render(<AppShell><div /></AppShell>);

    const fuelTrigger = screen.getByLabelText('Kraftstoffart wählen');
    fireEvent.click(fuelTrigger);

    const dieselOption = screen.getByRole('option', { name: /Diesel/i });
    fireEvent.click(dieselOption);

    expect(useAppStore.getState().filter.fuelType).toBe('diesel');
    expect(fuelTrigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('Escape key closes the popover', () => {
    render(<AppShell><div /></AppShell>);

    const radiusTrigger = screen.getByLabelText('Suchradius wählen');
    fireEvent.click(radiusTrigger);
    expect(radiusTrigger).toHaveAttribute('aria-expanded', 'true');

    const listbox = screen.getByRole('listbox', { name: 'Suchradius wählen' });
    fireEvent.keyDown(listbox, { key: 'Escape' });

    expect(radiusTrigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('marks the currently-selected option with aria-selected=true', () => {
    useAppStore.setState({
      filter: { fuelType: 'e5', radiusKm: 5, onlyOpen: false, brands: [], priceMin: null, priceMax: null },
    });
    render(<AppShell><div /></AppShell>);

    fireEvent.click(screen.getByLabelText('Kraftstoffart wählen'));

    const e5Option = screen.getByRole('option', { name: /Super E5/ });
    expect(e5Option).toHaveAttribute('aria-selected', 'true');

    const dieselOption = screen.getByRole('option', { name: /Diesel/ });
    expect(dieselOption).toHaveAttribute('aria-selected', 'false');
  });

  it('Arrow keys move keyboard focus through the options', () => {
    // Pin the starting selection to the smallest radius so initial
    // focus = index 0 — makes the assertions independent of defaults.
    useAppStore.setState({
      filter: { fuelType: 'e10', radiusKm: 2, onlyOpen: false, brands: [], priceMin: null, priceMax: null },
    });
    render(<AppShell><div /></AppShell>);

    const trigger = screen.getByLabelText('Suchradius wählen');
    fireEvent.click(trigger);
    const listbox = screen.getByRole('listbox', { name: 'Suchradius wählen' });

    const options = within(listbox).getAllByRole('option');
    expect(options.length).toBeGreaterThanOrEqual(2);

    // Initial state: option 0 (the selected one) has tabindex=0
    expect(options[0]).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    expect(options[1]).toHaveAttribute('tabindex', '0');
    expect(options[0]).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(listbox, { key: 'ArrowUp' });
    expect(options[0]).toHaveAttribute('tabindex', '0');

    // Home jumps back to first; End jumps to last
    fireEvent.keyDown(listbox, { key: 'End' });
    expect(options[options.length - 1]).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(listbox, { key: 'Home' });
    expect(options[0]).toHaveAttribute('tabindex', '0');
  });
});
