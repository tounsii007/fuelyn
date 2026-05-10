// @vitest-environment jsdom

// ============================================================
// ThemeQuickToggle — mount-gate regression test for commit
// 0bd5e41 ("ThemeQuickToggle — defer icon swap to after mount").
//
// The bug: server rendered <MoonIcon/> + "Auf dunklen Modus
// umschalten" because `useTheme().resolved` is always 'light' on
// the server (window.matchMedia is unavailable). Clients with a
// dark preference rendered <SunIcon/> + "Auf hellen Modus" on
// first paint → React 19 #418 hydration mismatch.
//
// The fix: a `mounted` flag (false during SSR + first hydration
// pass, flipped to true in useEffect). Until mounted, the
// component renders the SAME icon+label the server emits
// regardless of resolved theme; once mounted, the real icon
// appears via a normal state update.
//
// Test approach:
//   - `renderToString()` exercises the SSR path. Even when
//     useTheme reports 'dark', the SSR output MUST contain the
//     moon-icon "Auf dunklen Modus umschalten" placeholder —
//     that's the SSR-safe baseline the fix guarantees.
//   - `render()` then exercises the client path. After the mount
//     effect flushes, the actual resolved theme drives the icon
//     so the post-mount label is "Auf hellen Modus umschalten"
//     for resolved=dark.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

// Stubs that AppShell pulls in but we don't need here.
vi.mock('next/link', () => ({
  default: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));
vi.mock('@/components/notifications/NotificationBell', () => ({
  NotificationBell: () => <button aria-label="Benachrichtigungen">Bell</button>,
}));
vi.mock('@/components/ui/ThemeToggle', () => ({
  ThemeToggle: () => <button>theme</button>,
}));
vi.mock('@/components/stations/CompareTray', () => ({
  CompareTray: () => null,
}));

// Configurable theme mock — each test sets what useTheme should report.
const themeMock = vi.hoisted(() => ({
  resolved: 'dark' as 'light' | 'dark',
  toggle: vi.fn(),
}));
vi.mock('@/lib/theme/ThemeProvider', () => ({
  useTheme: () => ({
    resolved: themeMock.resolved,
    toggle: themeMock.toggle,
    preference: 'system',
    setPreference: vi.fn(),
  }),
}));

import { AppShell } from '../layout/AppShell';

describe('ThemeQuickToggle — mount-gate (commit 0bd5e41)', () => {
  afterEach(() => {
    cleanup();
    themeMock.toggle.mockReset();
  });

  it('SSR output renders the moon-icon placeholder even when useTheme reports dark', () => {
    // This is THE bug-pinning assertion: regardless of what the
    // useTheme hook reports, the server-rendered HTML MUST contain
    // the "Auf dunklen Modus umschalten" label and the moon icon.
    // If the mount-gate were removed, this would render
    // "Auf hellen Modus umschalten" + sun icon on the server,
    // mismatching the actual SSR (where matchMedia isn't available)
    // and bringing back React #418 on every page load.
    themeMock.resolved = 'dark';

    const html = renderToString(<AppShell><div /></AppShell>);

    // Pre-mount label must be the dark-switch copy
    expect(html).toMatch(/Auf dunklen Modus umschalten/);
    // …and NOT the sun-switch copy that would only be correct
    // post-mount in dark theme.
    expect(html).not.toMatch(/Auf hellen Modus umschalten/);
  });

  it('SSR output also renders the moon-icon placeholder when useTheme reports light', () => {
    // Sanity check: light theme also produces the moon-switch label
    // on the server (the placeholder is the same in both cases).
    themeMock.resolved = 'light';

    const html = renderToString(<AppShell><div /></AppShell>);

    expect(html).toMatch(/Auf dunklen Modus umschalten/);
    expect(html).not.toMatch(/Auf hellen Modus umschalten/);
  });

  it('after client mount the real resolved theme drives the icon (dark → sun)', () => {
    themeMock.resolved = 'dark';
    render(<AppShell><div /></AppShell>);

    // RTL flushes effects, so the post-mount label is what we see.
    expect(
      screen.getByLabelText(/Auf hellen Modus umschalten/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Auf dunklen Modus umschalten/i),
    ).toBeNull();
  });

  it('after client mount the real resolved theme drives the icon (light → moon)', () => {
    themeMock.resolved = 'light';
    render(<AppShell><div /></AppShell>);

    expect(
      screen.getByLabelText(/Auf dunklen Modus umschalten/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Auf hellen Modus umschalten/i),
    ).toBeNull();
  });

  it('clicking the toggle invokes the theme toggle handler', () => {
    themeMock.resolved = 'dark';
    render(<AppShell><div /></AppShell>);

    // Post-mount with dark resolved → button offers to switch to light
    const button = screen.getByLabelText(/Auf hellen Modus umschalten/i);
    button.click();

    expect(themeMock.toggle).toHaveBeenCalledTimes(1);
  });
});
