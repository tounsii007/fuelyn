// @vitest-environment jsdom

// ============================================================
// ThemeToggle — segmented light / system / dark radio group.
// ============================================================

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// Configurable theme mock — each test pins what useTheme reports and
// inspects the setPreference spy.
const themeMock = vi.hoisted(() => ({
  preference: 'system' as 'light' | 'system' | 'dark',
  setPreference: vi.fn(),
}));
vi.mock('@/lib/theme/ThemeProvider', () => ({
  useTheme: () => ({
    preference: themeMock.preference,
    resolved: themeMock.preference === 'dark' ? 'dark' : 'light',
    setPreference: themeMock.setPreference,
    toggle: vi.fn(),
  }),
}));

// Identity translation — assertions stay decoupled from i18n content.
vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { ThemeToggle } from '../ui/ThemeToggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    themeMock.preference = 'system';
    themeMock.setPreference.mockReset();
  });
  afterEach(() => cleanup());

  it('renders three radios labelled Hell / System / Dunkel', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('radio', { name: 'Hell' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'System' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Dunkel' })).toBeInTheDocument();
  });

  it('checks the radio matching the active preference', () => {
    themeMock.preference = 'dark';
    render(<ThemeToggle />);
    expect(screen.getByRole('radio', { name: 'Dunkel' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Hell' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'System' })).not.toBeChecked();
  });

  it('calls setPreference with the chosen value', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('radio', { name: 'Dunkel' }));
    expect(themeMock.setPreference).toHaveBeenCalledWith('dark');
  });

  it('styles the active option distinctly from inactive ones', () => {
    themeMock.preference = 'light';
    render(<ThemeToggle />);
    const active = screen.getByRole('radio', { name: 'Hell' }).closest('label');
    const inactive = screen.getByRole('radio', { name: 'Dunkel' }).closest('label');
    expect(active?.className).toMatch(/--color-surface/);
    expect(inactive?.className).toMatch(/--color-fg-subtle/);
  });

  it('exposes a labelled radiogroup (fieldset) and forwards className', () => {
    render(<ThemeToggle className="custom-cls" />);
    const group = screen.getByRole('group', { name: 'miscAria.appearance' });
    expect(group.className).toMatch(/custom-cls/);
  });
});
