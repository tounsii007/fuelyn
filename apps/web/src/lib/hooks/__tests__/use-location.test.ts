// @vitest-environment jsdom

// ============================================================
// useGeolocation — tests for secure-context detection, denial
// handling, and the on-mount auto-request path.
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useGeolocation } from '../use-location';
import { useAppStore } from '@/lib/store/app-store';

describe('useGeolocation', () => {
  let originalGeolocation: typeof navigator.geolocation;
  let originalSecureContext: boolean;
  let originalPermissions: typeof navigator.permissions;

  beforeEach(() => {
    originalGeolocation = navigator.geolocation;
    originalSecureContext = window.isSecureContext;
    originalPermissions = navigator.permissions;
    useAppStore.setState({
      userLocation: null,
      locationPermission: 'prompt',
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'geolocation', {
      value: originalGeolocation,
      configurable: true,
    });
    Object.defineProperty(window, 'isSecureContext', {
      value: originalSecureContext,
      configurable: true,
    });
    Object.defineProperty(navigator, 'permissions', {
      value: originalPermissions,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('falls back to a Berlin demo location on insecure HTTP', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    // Force the hostname to be non-localhost so the secure-context check fails outright
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname: 'phone.local' },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.userLocation).toEqual({ lat: 52.52, lng: 13.405 });
    });
    expect(result.current.insecureContext).toBe(true);
    expect(result.current.permission).toBe('granted');
  });

  it('marks permission as denied when geolocation API itself is missing', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(navigator, 'geolocation', {
      value: undefined,
      configurable: true,
    });
    // No Permissions API either, so the hook calls requestLocation directly
    Object.defineProperty(navigator, 'permissions', {
      value: undefined,
      configurable: true,
    });

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.permission).toBe('denied');
    });
    expect(result.current.userLocation).toBeNull();
  });

  it('updates store when getCurrentPosition succeeds', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (success: PositionCallback) => {
          success({
            coords: {
              latitude: 50.5867,
              longitude: 8.6783,
              accuracy: 10,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          } as GeolocationPosition);
        },
      },
      configurable: true,
    });
    // Bypass the Permissions API; let the hook call requestLocation directly
    Object.defineProperty(navigator, 'permissions', {
      value: undefined,
      configurable: true,
    });

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.userLocation).toEqual({ lat: 50.5867, lng: 8.6783 });
    });
    expect(result.current.permission).toBe('granted');
  });

  it('marks permission as denied when getCurrentPosition errors', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => {
          error({
            code: 1,
            message: 'User denied geolocation',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          } as GeolocationPositionError);
        },
      },
      configurable: true,
    });
    Object.defineProperty(navigator, 'permissions', {
      value: undefined,
      configurable: true,
    });

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.permission).toBe('denied');
    });
    expect(result.current.userLocation).toBeNull();
  });

  it('requestLocation is idempotent under rapid double-clicks', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    // The mock never calls success/error, so the in-flight flag stays
    // true forever — perfect for proving the no-double-fire guard.
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
    });
    Object.defineProperty(navigator, 'permissions', {
      value: undefined,
      configurable: true,
    });

    const { result } = renderHook(() => useGeolocation());

    // The on-mount auto-request fires once and is now in flight.
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.requestLocation();
      result.current.requestLocation();
      result.current.requestLocation();
    });

    // None of the explicit clicks should have started a second
    // navigator request — they were all swallowed by the
    // in-flight guard. Total call count stays at 1.
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });
});
