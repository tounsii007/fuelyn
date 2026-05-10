// @vitest-environment jsdom

// ============================================================
// SettingsPage Background-Picker — proves the bug we fixed:
//   1. Click on a variant → store.settings.background updates.
//   2. The store update would cascade into ThemeSync writing
//      data-bg on <html>, which the CSS uses to swap the mesh.
//
// We test the click→store→data-bg path end-to-end by rendering
// both <ThemeSync> (extracted via providers) and <SettingsPage>.
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { useAppStore } from '@/lib/store/app-store';
import { useEffect } from 'react';
import type { BackgroundVariant } from '@fuelyn/core';

// Stub Next link (router-free in test environment)
vi.mock('next/link', () => ({
  default: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));

// Mock translation — the picker renders raw labels so all we need is t(key)→fallback
vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

// Lightweight ThemeSync replica — same logic as providers.tsx, isolated
// so we don't pull in QueryClient/Splash/etc.
function ThemeSync() {
  const background = useAppStore((s) => s.settings.background);
  useEffect(() => {
    const variant = background && typeof background === 'string' ? background : 'aurora';
    document.documentElement.setAttribute('data-bg', variant);
    document.documentElement.dataset.bg = variant;
  }, [background]);
  return null;
}

import { SettingsPage } from '../settings/SettingsPage';
import { ToastProvider } from '../ui/Toast';

// Wrap in ToastProvider — SpritmonitorImport (mounted in the
// Data section) calls useToast(), so without the provider the
// whole SettingsPage render fails. Fake context kept minimal:
// the test doesn't interact with the import button at all.
function renderSettings(node: React.ReactNode) {
  return render(<ToastProvider>{node}</ToastProvider>);
}

describe('Background variant picker', () => {
  beforeEach(() => {
    // Reset store state
    useAppStore.setState((s) => ({
      settings: { ...s.settings, background: 'aurora' },
    }));
    document.documentElement.removeAttribute('data-bg');
  });

  afterEach(() => cleanup());

  it('initial render — store default propagates to <html data-bg>', async () => {
    renderSettings(<><ThemeSync /><SettingsPage /></>);
    // First effect cycle should land on aurora
    await act(async () => {});
    expect(document.documentElement.getAttribute('data-bg')).toBe('aurora');
  });

  it('clicking Sunset updates store AND cascades to <html data-bg="sunset">', async () => {
    renderSettings(<><ThemeSync /><SettingsPage /></>);

    const sunsetButton = screen.getByRole('button', { name: /Sunset/ });
    fireEvent.click(sunsetButton);

    await act(async () => {});

    expect(useAppStore.getState().settings.background).toBe('sunset');
    expect(document.documentElement.getAttribute('data-bg')).toBe('sunset');
    expect(document.documentElement.dataset.bg).toBe('sunset');
  });

  it.each<BackgroundVariant>(['aurora', 'sunset', 'ocean', 'forest', 'cyber', 'minimal'])(
    'all six variants round-trip cleanly: %s',
    async (variant) => {
      renderSettings(<><ThemeSync /><SettingsPage /></>);
      const button = screen.getByRole('button', { name: new RegExp(variant, 'i') });

      fireEvent.click(button);
      await act(async () => {});

      expect(useAppStore.getState().settings.background).toBe(variant);
      expect(document.documentElement.getAttribute('data-bg')).toBe(variant);
    },
  );

  it('aria-pressed reflects the active variant', async () => {
    renderSettings(<><ThemeSync /><SettingsPage /></>);
    const ocean = screen.getByRole('button', { name: /Ocean/ });

    expect(ocean).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(ocean);
    await act(async () => {});

    expect(ocean).toHaveAttribute('aria-pressed', 'true');
  });

  it('falls back to aurora when stored background is undefined / corrupt', async () => {
    // Simulate a stale persisted setting from before background was added.
    // We deliberately set an invalid value (the field is non-nullable in
    // the type, so we go through `as any` to express "ill-formed data").
    useAppStore.setState((s) => ({
      settings: { ...s.settings, background: undefined as unknown as 'aurora' },
    }));

    render(<ThemeSync />);
    await act(async () => {});

    expect(document.documentElement.getAttribute('data-bg')).toBe('aurora');
  });
});
