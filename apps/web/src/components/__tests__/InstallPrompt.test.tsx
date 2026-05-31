// @vitest-environment jsdom

// ============================================================
// InstallPrompt — owns the beforeinstallprompt (BIP) lifecycle and
// renders a PWA install banner. Hidden until a BIP event fires;
// "Später" suppresses it for 30 days (timestamp in localStorage);
// "Installieren" calls the deferred event's prompt(). This jsdom
// env ships a non-functional localStorage placeholder (no methods)
// and no matchMedia, so both are stubbed: matchMedia → "not
// installed", localStorage → a fresh in-memory store per test.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

import { InstallPrompt } from '../pwa/InstallPrompt';

const STORAGE_KEY = 'fy:install-prompt-dismissed-at';

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function makeStorageStub(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => {
      map.delete(k);
    },
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
  };
}

function makeBipEvent() {
  return Object.assign(new Event('beforeinstallprompt'), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: 'accepted' as const }),
  });
}

describe('InstallPrompt', () => {
  let storage: Storage;

  beforeEach(() => {
    stubMatchMedia(false);
    storage = makeStorageStub();
    vi.stubGlobal('localStorage', storage);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders nothing until a beforeinstallprompt event fires', () => {
    const { container } = render(<InstallPrompt />);
    expect(container.firstChild).toBeNull();
  });

  it('reveals the install dialog once the BIP event is captured', () => {
    render(<InstallPrompt />);
    act(() => {
      window.dispatchEvent(makeBipEvent());
    });
    expect(screen.getByRole('dialog', { name: 'App installieren' })).toBeInTheDocument();
    expect(screen.getByText('Installieren')).toBeInTheDocument();
    expect(screen.getByText('Später')).toBeInTheDocument();
  });

  it('suppresses itself and records a timestamp when dismissed', () => {
    render(<InstallPrompt />);
    act(() => {
      window.dispatchEvent(makeBipEvent());
    });
    fireEvent.click(screen.getByText('Später'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(storage.getItem(STORAGE_KEY)).toBeTruthy();
  });

  it('fires the deferred prompt and hides when accepted', async () => {
    const evt = makeBipEvent();
    render(<InstallPrompt />);
    act(() => {
      window.dispatchEvent(evt);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Installieren'));
    });
    expect(evt.prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
