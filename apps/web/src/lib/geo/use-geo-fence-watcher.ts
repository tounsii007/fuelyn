// ============================================================
// useGeoFenceWatcher — runs while the app is foreground.
//
// Strategy:
//   • Calls navigator.geolocation.watchPosition with a long-poll
//     enableHighAccuracy:false so the OS uses cheap network-based
//     positioning (huge battery win).
//   • Throttles the engine to one evaluation every 30 s minimum.
//   • Filters fences by maxPrice + fuelType in memory; the actual
//     prices come from the unified-stations response that's already
//     in the React Query cache, so there's no extra fetch.
//   • Emits Toast notifications + (if granted) a native Notification.
// ============================================================

'use client';

import { useEffect, useRef } from 'react';
import {
  evaluateFences,
  type FenceEngineState,
  type FenceEvent,
  type GeoFence,
  type LatLng,
  type StationPriceSnapshot,
} from '@fuelyn/core';
import { useToast } from '@/components/ui/Toast';

const THROTTLE_MS = 30_000; // min 30s between engine calls
const COOLDOWN_MS = 30 * 60_000; // 30 min between alerts per fence

export interface UseGeoFenceWatcherOptions {
  readonly enabled: boolean;
  readonly fences: ReadonlyArray<GeoFence>;
  readonly prices: ReadonlyArray<StationPriceSnapshot>;
  readonly onEvent?: (event: FenceEvent) => void;
}

export function useGeoFenceWatcher({
  enabled,
  fences,
  prices,
  onEvent,
}: UseGeoFenceWatcherOptions) {
  const toast = useToast();
  const stateRef = useRef<FenceEngineState>({ cooldown: new Map() });
  const lastEvalRef = useRef<number>(0);
  const fencesRef = useRef(fences);
  const pricesRef = useRef(prices);
  const onEventRef = useRef(onEvent);

  // Keep refs in sync without re-subscribing geolocation
  useEffect(() => {
    fencesRef.current = fences;
  }, [fences]);
  useEffect(() => {
    pricesRef.current = prices;
  }, [prices]);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;
    if (fences.length === 0) return;

    const handle = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastEvalRef.current < THROTTLE_MS) return;
        lastEvalRef.current = now;

        const pos: LatLng = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        const result = evaluateFences(
          pos,
          fencesRef.current,
          pricesRef.current,
          stateRef.current,
          { cooldownMs: COOLDOWN_MS, now },
        );
        stateRef.current = result.nextState;

        for (const event of result.events) {
          // 1) Always show in-app toast
          toast.show({
            tone: 'success',
            title: event.title,
            description: event.body,
            durationMs: 8000,
          });
          // 2) Native notification if permission was granted
          if (
            typeof window !== 'undefined' &&
            'Notification' in window &&
            Notification.permission === 'granted'
          ) {
            try {
              new Notification(event.title, {
                body: event.body,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: `fence-${event.fence.id}`,
              });
            } catch {
              // some browsers throw when the page is hidden — ignore
            }
          }
          onEventRef.current?.(event);
        }
      },
      (err) => {
        // Position errors are normal (permission denied, timeout). Quiet log.
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[geo-fence-watcher]', err.code, err.message);
        }
      },
      {
        enableHighAccuracy: false,
        maximumAge: 30_000,
        timeout: 60_000,
      },
    );

    return () => {
      navigator.geolocation.clearWatch(handle);
    };
    // Subscription only depends on whether the watcher is enabled and
    // whether the fence list is empty — not on the actual list contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, fences.length === 0, toast]);
}

/** Convenience helper for requesting native notification permission. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}
