// ============================================================
// NativeBridge tests — pure-JS, no jsdom required.
// Each test toggles globalThis.Capacitor to simulate the
// presence/absence of the native runtime.
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getPlatform,
  isNative,
  hapticImpact,
  setStatusBarStyle,
  nativeToast,
  shareNative,
  getNativeLocation,
} from '../bridge';

declare global {
   
  var Capacitor: unknown;
}

afterEach(() => {
  delete (globalThis as { Capacitor?: unknown }).Capacitor;
});

describe('getPlatform / isNative — web fallback', () => {
  it('returns "web" when no Capacitor global', () => {
    expect(getPlatform()).toBe('web');
    expect(isNative()).toBe(false);
  });

  it('returns "ios" when Capacitor reports iOS', () => {
    (globalThis as { Capacitor?: unknown }).Capacitor = {
      getPlatform: () => 'ios',
      isNativePlatform: () => true,
    };
    expect(getPlatform()).toBe('ios');
    expect(isNative()).toBe(true);
  });

  it('handles a Capacitor that throws', () => {
    (globalThis as { Capacitor?: unknown }).Capacitor = {
      getPlatform: () => { throw new Error('boom'); },
      isNativePlatform: () => { throw new Error('boom'); },
    };
    expect(getPlatform()).toBe('web');
    expect(isNative()).toBe(false);
  });
});

describe('hapticImpact', () => {
  it('is a silent no-op on web', async () => {
    await expect(hapticImpact('LIGHT')).resolves.toBeUndefined();
  });

  it('forwards to the Haptics plugin when present', async () => {
    const impact = vi.fn().mockResolvedValue(undefined);
    (globalThis as { Capacitor?: unknown }).Capacitor = {
      Plugins: { Haptics: { impact } },
    };
    await hapticImpact('HEAVY');
    expect(impact).toHaveBeenCalledWith({ style: 'HEAVY' });
  });

  it('does not throw when the plugin rejects', async () => {
    (globalThis as { Capacitor?: unknown }).Capacitor = {
      Plugins: { Haptics: { impact: () => Promise.reject(new Error('x')) } },
    };
    await expect(hapticImpact('LIGHT')).resolves.toBeUndefined();
  });
});

describe('setStatusBarStyle', () => {
  it('forwards to StatusBar when available', async () => {
    const setStyle = vi.fn().mockResolvedValue(undefined);
    (globalThis as { Capacitor?: unknown }).Capacitor = {
      Plugins: { StatusBar: { setStyle } },
    };
    await setStatusBarStyle('DARK');
    expect(setStyle).toHaveBeenCalledWith({ style: 'DARK' });
  });

  it('is a no-op when plugin missing', async () => {
    await expect(setStatusBarStyle('LIGHT')).resolves.toBeUndefined();
  });
});

describe('shareNative', () => {
  it('returns true when the Share plugin succeeds', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    (globalThis as { Capacitor?: unknown }).Capacitor = { Plugins: { Share: { share } } };
    const ok = await shareNative({ title: 'X', url: 'https://example.com' });
    expect(ok).toBe(true);
    expect(share).toHaveBeenCalled();
  });

  it('falls back to navigator.share when no Capacitor', async () => {
    const navShare = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'navigator', {
      value: { share: navShare },
      configurable: true,
    });
    const ok = await shareNative({ title: 'X' });
    expect(ok).toBe(true);
    expect(navShare).toHaveBeenCalled();
  });

  it('returns false when no share path is available', async () => {
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
    const ok = await shareNative({ title: 'X' });
    expect(ok).toBe(false);
  });
});

describe('nativeToast', () => {
  it('is a no-op on web', async () => {
    await expect(nativeToast('hi')).resolves.toBeUndefined();
  });

  it('forwards to the Toast plugin', async () => {
    const show = vi.fn().mockResolvedValue(undefined);
    (globalThis as { Capacitor?: unknown }).Capacitor = { Plugins: { Toast: { show } } };
    await nativeToast('hello', 'long');
    expect(show).toHaveBeenCalledWith({ text: 'hello', duration: 'long' });
  });
});

describe('getNativeLocation', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  });

  it('returns null when nothing available', async () => {
    expect(await getNativeLocation()).toBeNull();
  });

  it('forwards to the Geolocation plugin first', async () => {
    const getCurrentPosition = vi.fn().mockResolvedValue({
      coords: { latitude: 52.52, longitude: 13.405, accuracy: 12 },
    });
    (globalThis as { Capacitor?: unknown }).Capacitor = {
      Plugins: { Geolocation: { getCurrentPosition } },
    };
    const loc = await getNativeLocation();
    expect(loc).toEqual({ lat: 52.52, lng: 13.405, accuracy: 12 });
    expect(getCurrentPosition).toHaveBeenCalled();
  });

  it('falls back to navigator.geolocation when no plugin', async () => {
    const getCurrentPosition = vi.fn((ok: (p: GeolocationPosition) => void) => {
      ok({
        coords: { latitude: 1, longitude: 2, accuracy: 3 } as GeolocationCoordinates,
      } as GeolocationPosition);
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: { geolocation: { getCurrentPosition } },
      configurable: true,
    });
    const loc = await getNativeLocation();
    expect(loc).toEqual({ lat: 1, lng: 2, accuracy: 3 });
  });
});
