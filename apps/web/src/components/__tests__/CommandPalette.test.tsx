// @vitest-environment jsdom

// ============================================================
// CommandPalette — ⌘K dialog: open/close, fuzzy filter,
// keyboard navigation, command invocation.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const pushMock = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const setPreferenceMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/theme/ThemeProvider', () => ({
  useTheme: () => ({
    preference: 'system',
    resolved: 'light',
    setPreference: setPreferenceMock,
    toggle: vi.fn(),
  }),
}));

import { CommandPalette } from '../ui/CommandPalette';

afterEach(() => {
  cleanup();
  pushMock.mockReset();
  setPreferenceMock.mockReset();
});

// Convenience: render closed, then open via the ⌘K shortcut.
function renderOpen() {
  const utils = render(<CommandPalette />);
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  return utils;
}

describe('CommandPalette', () => {
  it('renders nothing until opened', () => {
    render(<CommandPalette />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('opens on Ctrl/⌘+K', () => {
    renderOpen();
    expect(screen.getByRole('dialog', { name: 'Befehlspalette' })).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('opens on the tp:open-command-palette custom event', () => {
    render(<CommandPalette />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent(window, new CustomEvent('tp:open-command-palette'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    renderOpen();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes when the backdrop is clicked', () => {
    renderOpen();
    // The backdrop is the aria-hidden overlay sitting behind the dialog.
    const backdrop = document.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('fuzzy-filters the command list as you type', () => {
    renderOpen();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Vergleich' } });
    expect(screen.getByRole('option', { name: /Vergleich/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Routenplaner/ })).toBeNull();
  });

  it('shows an empty state when nothing matches', () => {
    renderOpen();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'zzzzzz' } });
    expect(screen.queryByRole('option')).toBeNull();
    expect(screen.getByText('Keine Treffer.')).toBeInTheDocument();
  });

  it('invokes a navigation command on click and closes', () => {
    renderOpen();
    fireEvent.click(screen.getByRole('option', { name: /Vergleich/ }));
    expect(pushMock).toHaveBeenCalledWith('/compare');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('invokes the highlighted command on Enter', () => {
    renderOpen();
    const input = screen.getByRole('textbox');
    // Narrow to a single command so activeIdx (reset to 0) targets it.
    fireEvent.change(input, { target: { value: 'Vergleich' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(pushMock).toHaveBeenCalledWith('/compare');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('runs appearance commands through setPreference', () => {
    renderOpen();
    fireEvent.click(screen.getByRole('option', { name: /Dunkler Modus/ }));
    expect(setPreferenceMock).toHaveBeenCalledWith('dark');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('moves the active option with ArrowDown', () => {
    renderOpen();
    const input = screen.getByRole('textbox');
    // First command (Karte) is active by default.
    expect(screen.getByRole('option', { name: /Karte/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: /Vergleich/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('option', { name: /Karte/ })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });
});
