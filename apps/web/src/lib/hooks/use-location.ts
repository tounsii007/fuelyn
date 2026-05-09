// ============================================================
// Fuelyn Web — Geolocation Hook
//
// Three operating modes, in order of cost:
//
//   1) Coarse single-shot (default, auto-mount) —
//        getCurrentPosition with cached fixes accepted. Burns no
//        battery; gives a "good enough" city-level position so the
//        map can centre and stations can be ranked.
//
//   2) Precise refining (`requestLocation({highAccuracy:true})`) —
//        watchPosition that keeps the BEST sample we've seen and
//        commits exactly once on settle (≤25 m, plateau, or 20 s
//        timeout). Triggered by the explicit crosshair button.
//        Desktop browsers in particular emit a coarse fix first
//        and refine over a few seconds; without watching we'd
//        cement the worst sample.
//
//   3) Live tracking (`useLiveLocation()` hook) —
//        long-running watchPosition that streams updates into the
//        store as the user moves. Throttled so the map only
//        re-centres on meaningful movement. Used by the home view
//        once we have permission, so distances/sorting refresh
//        without a manual refetch.
//
// Secure-context handling: when accessed over plain HTTP (e.g.
// phone-on-LAN), GPS is blocked by the browser. We detect that
// early, set a Berlin demo location, and skip retries.
// ============================================================

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/app-store';

/** True when geolocation is available (HTTPS, localhost, or file://) */
function isSecureContext(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.isSecureContext === 'boolean') return window.isSecureContext;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

/** Stop refining once the GPS fix is this precise (≈ building). */
const TARGET_ACCURACY_M = 25;
/** No-improvement window before we declare the fix has plateaued. */
const ASYMPTOTE_MS = 4_000;
/** Hard upper bound on a precise-mode request before we settle. */
const PRECISE_TIMEOUT_MS = 20_000;
/** For live tracking: minimum movement (m) that qualifies as "user
 *  moved" — below this we don't re-commit, to avoid jittery map
 *  re-centres caused by GPS noise. */
const LIVE_MIN_MOVE_M = 30;
/** For live tracking: minimum time between commits even when the
 *  user moves further. Caps the update rate when GPS is fast. */
const LIVE_MIN_INTERVAL_MS = 5_000;

/** Haversine distance in metres between two lat/lng points. */
function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sin1 = Math.sin(dLat / 2);
  const sin2 = Math.sin(dLng / 2);
  const h = sin1 * sin1 + Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function useGeolocation() {
  const setUserLocation = useAppStore((s) => s.setUserLocation);
  const setGeolocatedPosition = useAppStore((s) => s.setGeolocatedPosition);
  const setPermission = useAppStore((s) => s.setLocationPermission);
  const userLocation = useAppStore((s) => s.userLocation);
  const userLocationAccuracy = useAppStore((s) => s.userLocationAccuracy);
  const permission = useAppStore((s) => s.locationPermission);
  const requestInFlightRef = useRef(false);
  const watchIdRef = useRef<number | null>(null);
  const [insecureContext, setInsecureContext] = useState(false);
  const [isRefining, setIsRefining] = useState(false);

  const requestLocation = useCallback((options?: { highAccuracy?: boolean }) => {
    if (typeof navigator === 'undefined' || requestInFlightRef.current) return;

    if (!isSecureContext()) {
      setInsecureContext(true);
      setUserLocation({ lat: 52.5200, lng: 13.4050 });
      setPermission('granted');
      return;
    }

    if (!navigator.geolocation) {
      setPermission('denied');
      return;
    }

    const highAccuracy = options?.highAccuracy ?? false;

    // ─── Precise refining path ───────────────────────────────
    // When the caller wants street-level accuracy, drive a
    // watchPosition. Collect samples, keep only the best one, and
    // commit it exactly once on settle so the map doesn't flutter
    // through three slowly-improving positions in a row.
    if (highAccuracy && typeof navigator.geolocation.watchPosition === 'function') {
      requestInFlightRef.current = true;
      setIsRefining(true);

      let bestSample: { coords: { lat: number; lng: number }; accuracy: number } | null = null;
      let lastImprovementAt = Date.now();
      let settled = false;
      let asymptoteTimer: ReturnType<typeof setInterval> | null = null;
      let hardTimeout: ReturnType<typeof setTimeout> | null = null;

      const stopWatch = () => {
        if (watchIdRef.current !== null && navigator.geolocation.clearWatch) {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }
        watchIdRef.current = null;
        if (asymptoteTimer) clearInterval(asymptoteTimer);
        if (hardTimeout) clearTimeout(hardTimeout);
      };

      const commitAndSettle = () => {
        if (settled) return;
        settled = true;
        requestInFlightRef.current = false;
        if (bestSample) {
          setGeolocatedPosition(bestSample.coords, bestSample.accuracy);
          setPermission('granted');
        }
        setIsRefining(false);
        stopWatch();
      };

      const settleWithoutCommit = () => {
        if (settled) return;
        settled = true;
        requestInFlightRef.current = false;
        setIsRefining(false);
        stopWatch();
      };

      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          if (settled) return;
          const acc = pos.coords.accuracy;
          if (!Number.isFinite(acc)) return;
          if (!bestSample || acc < bestSample.accuracy) {
            bestSample = {
              coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
              accuracy: acc,
            };
            lastImprovementAt = Date.now();
          }
          if (acc <= TARGET_ACCURACY_M) {
            commitAndSettle();
          }
        },
        (err) => {
          if (settled) return;
          if (err.code === err.PERMISSION_DENIED) {
            setPermission('denied');
            settleWithoutCommit();
            return;
          }
          if (process.env.NODE_ENV !== 'production') {
            console.info('[Fuelyn] Geolocation watch error:', err.message);
          }
        },
        { enableHighAccuracy: true, timeout: PRECISE_TIMEOUT_MS, maximumAge: 0 },
      );

      asymptoteTimer = setInterval(() => {
        if (settled) return;
        if (bestSample && Date.now() - lastImprovementAt > ASYMPTOTE_MS) {
          commitAndSettle();
        }
      }, 500);

      hardTimeout = setTimeout(() => {
        if (settled) return;
        if (bestSample) {
          commitAndSettle();
        } else {
          setPermission('denied');
          settleWithoutCommit();
        }
      }, PRECISE_TIMEOUT_MS);

      return;
    }

    // ─── Coarse single-shot path (auto-mount, tests) ─────────
    requestInFlightRef.current = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        requestInFlightRef.current = false;
        const acc = pos.coords.accuracy;
        setGeolocatedPosition(
          { lat: pos.coords.latitude, lng: pos.coords.longitude },
          Number.isFinite(acc) ? acc : null,
        );
        setPermission('granted');
      },
      (err) => {
        requestInFlightRef.current = false;
        if (process.env.NODE_ENV !== 'production') {
          console.info('[Fuelyn] Geolocation unavailable:', err.message);
        }
        setPermission('denied');
      },
      {
        enableHighAccuracy: highAccuracy,
        timeout: highAccuracy ? 20_000 : 10_000,
        maximumAge: highAccuracy ? 0 : 60_000,
      },
    );
  }, [setUserLocation, setGeolocatedPosition, setPermission]);

  // Auto-request on mount if not denied
  useEffect(() => {
    if (permission === 'denied') return;
    if (userLocation) return;
    if (typeof navigator === 'undefined') return;

    if (!isSecureContext()) {
      setInsecureContext(true);
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

  // Tear down any in-flight refining watch when the consumer unmounts
  useEffect(() => {
    return () => {
      if (
        watchIdRef.current !== null &&
        typeof navigator !== 'undefined' &&
        navigator.geolocation?.clearWatch
      ) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  return {
    userLocation,
    accuracyMeters: userLocationAccuracy,
    permission,
    requestLocation,
    insecureContext,
    isRefining,
  };
}

// ─── Live tracking hook ────────────────────────────────────────
//
// Streams continuous position updates into the store as the user
// moves. Throttled to LIVE_MIN_MOVE_M and LIVE_MIN_INTERVAL_MS so
// the map doesn't flutter on every GPS sample.
//
// Mount this hook on a screen that should reflect the user's
// current position (typically the home map view). It self-disables
// when geolocation isn't permitted or available, so wrapping it in
// conditionals isn't necessary — just call it.

export function useLiveLocation(options?: { enabled?: boolean }): void {
  const enabled = options?.enabled ?? true;
  const setGeolocatedPosition = useAppStore((s) => s.setGeolocatedPosition);
  const setLiveTracking = useAppStore((s) => s.setLiveTracking);
  const setPermission = useAppStore((s) => s.setLocationPermission);
  const permission = useAppStore((s) => s.locationPermission);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === 'undefined') return;
    if (!navigator.geolocation?.watchPosition) return;
    if (permission === 'denied') return;
    if (!isSecureContext()) return;

    let lastCommit: { lat: number; lng: number; ts: number } | null = null;
    setLiveTracking(true);

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const acc = pos.coords.accuracy;
        if (!Number.isFinite(acc)) return;
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const now = Date.now();

        // Throttle: skip commit when we haven't moved meaningfully
        // AND the previous commit is recent. The first sample
        // always commits so the map snaps to the live position
        // immediately.
        if (lastCommit) {
          const moved = distanceM(lastCommit, next);
          const elapsed = now - lastCommit.ts;
          if (moved < LIVE_MIN_MOVE_M && elapsed < LIVE_MIN_INTERVAL_MS) return;
        }

        lastCommit = { ...next, ts: now };
        setGeolocatedPosition(next, Number.isFinite(acc) ? acc : null);
        setPermission('granted');
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setPermission('denied');
        }
        // Other errors (TIMEOUT, POSITION_UNAVAILABLE) are
        // transient — the watch keeps running; logged at debug
        // level only.
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[Fuelyn] Live-GPS error:', err.message);
        }
      },
      {
        // Live mode favours freshness over precision: cached fixes
        // up to 10 s old are fine, no GPS hardware required.
        enableHighAccuracy: false,
        timeout: 30_000,
        maximumAge: 10_000,
      },
    );

    return () => {
      if (navigator.geolocation.clearWatch) {
        navigator.geolocation.clearWatch(watchId);
      }
      setLiveTracking(false);
    };
  }, [enabled, permission, setGeolocatedPosition, setLiveTracking, setPermission]);
}
