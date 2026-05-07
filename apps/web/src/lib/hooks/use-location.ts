// ============================================================
// TankPilot Web — Geolocation Hook
// Handles secure-context restrictions gracefully: when accessed
// over HTTP (e.g. phone on same WiFi), GPS is blocked by the
// browser. In that case, we detect it early and skip retries.
// ============================================================

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/app-store';

/** True when geolocation is available (HTTPS, localhost, or file://) */
function isSecureContext(): boolean {
  if (typeof window === 'undefined') return false;
  // window.isSecureContext is the standard check
  if (typeof window.isSecureContext === 'boolean') return window.isSecureContext;
  // Fallback: localhost is always secure
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

export function useGeolocation() {
  const setUserLocation = useAppStore((s) => s.setUserLocation);
  const setPermission = useAppStore((s) => s.setLocationPermission);
  const userLocation = useAppStore((s) => s.userLocation);
  const permission = useAppStore((s) => s.locationPermission);
  const requestInFlightRef = useRef(false);
  const [insecureContext, setInsecureContext] = useState(false);

  /**
   * Request the device location.
   *
   * @param options.highAccuracy
   *   When `true` we ask the OS to use GPS (vs. coarse network/Wi-Fi
   *   triangulation), waive cached fixes, and give the radio more
   *   time. Use it for explicit user-initiated requests (e.g. the
   *   crosshair button in the search bar) so the resulting fix is
   *   precise enough for street-level reverse-geocoding. Auto-mount
   *   keeps the cheap path so we don't burn battery on every load.
   */
  const requestLocation = useCallback((options?: { highAccuracy?: boolean }) => {
    if (typeof navigator === 'undefined' || requestInFlightRef.current) {
      return;
    }

    // Check secure context first — GPS is blocked over plain HTTP
    if (!isSecureContext()) {
      setInsecureContext(true);
      // Don't set permission to 'denied' — it's not the user's fault
      // Instead, silently fall back to demo location (Berlin)
      setUserLocation({ lat: 52.5200, lng: 13.4050 });
      setPermission('granted');
      return;
    }

    if (!navigator.geolocation) {
      setPermission('denied');
      return;
    }

    const highAccuracy = options?.highAccuracy ?? false;

    requestInFlightRef.current = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        requestInFlightRef.current = false;
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setPermission('granted');
      },
      (err) => {
        requestInFlightRef.current = false;
        // Only log in development, not a real error for the user
        if (process.env.NODE_ENV !== 'production') {
          console.info('[TankPilot] Geolocation unavailable:', err.message);
        }
        setPermission('denied');
      },
      {
        // High-accuracy uses GPS hardware where available; coarse mode
        // is fine for the auto-mount fallback.
        enableHighAccuracy: highAccuracy,
        // Longer wait when going to GPS — first cold fix can take 15+ s
        timeout: highAccuracy ? 20_000 : 10_000,
        // Always force a fresh fix when the user explicitly asks
        maximumAge: highAccuracy ? 0 : 60_000,
      },
    );
  }, [setUserLocation, setPermission]);

  // Auto-request on mount if not denied
  useEffect(() => {
    if (permission === 'denied') return;
    if (userLocation) return;
    if (typeof navigator === 'undefined') return;

    // Skip geolocation entirely on insecure contexts
    if (!isSecureContext()) {
      setInsecureContext(true);
      // Auto-set demo location for a smooth experience
      setUserLocation({ lat: 52.5200, lng: 13.4050 });
      setPermission('granted');
      return;
    }

    if (!navigator.permissions) {
      requestLocation();
      return;
    }

    let isActive = true;
    let permissionStatus: PermissionStatus | null = null;

    const syncPermission = () => {
      if (!permissionStatus || !isActive) return;

      const nextPermission =
        permissionStatus.state === 'denied'
          ? 'denied'
          : permissionStatus.state === 'granted'
            ? 'granted'
            : 'prompt';
      setPermission(nextPermission);

      if (permissionStatus.state !== 'denied' && !useAppStore.getState().userLocation) {
        requestLocation();
      }
    };

    navigator.permissions
      .query({ name: 'geolocation' })
      .then((result) => {
        if (!isActive) return;
        permissionStatus = result;
        syncPermission();
        result.addEventListener('change', syncPermission);
      })
      .catch(() => {
        requestLocation();
      });

    return () => {
      isActive = false;
      permissionStatus?.removeEventListener('change', syncPermission);
    };
  }, [permission, requestLocation, setPermission, setUserLocation, userLocation]);

  return { userLocation, permission, requestLocation, insecureContext };
}
