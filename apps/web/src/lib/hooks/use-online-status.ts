// ============================================================
// TankPilot Web — useOnlineStatus Hook
// Tracks online/offline state and whether the user was recently
// offline (for "back online" toasts).
// ============================================================

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface UseOnlineStatusReturn {
  /** Whether the browser is currently online. */
  isOnline: boolean;
  /** Whether the user was recently offline (transitions to false after a delay). */
  wasOffline: boolean;
}

const BACK_ONLINE_DISPLAY_MS = 4000;

/**
 * Hook that monitors online/offline status using `navigator.onLine`
 * and the `online`/`offline` window events.
 *
 * `wasOffline` becomes true when transitioning from offline to online,
 * then automatically resets after a short delay.
 */
export function useOnlineStatus(): UseOnlineStatusReturn {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [wasOffline, setWasOffline] = useState(false);
  const wasOfflineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousOnlineRef = useRef(isOnline);

  const handleOnline = useCallback(() => {
    setIsOnline(true);

    // If we were previously offline, set wasOffline flag
    if (!previousOnlineRef.current) {
      setWasOffline(true);

      // Request the service worker to sync prices
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'REQUEST_SYNC' });
      }

      // Clear wasOffline after a delay
      if (wasOfflineTimerRef.current) {
        clearTimeout(wasOfflineTimerRef.current);
      }
      wasOfflineTimerRef.current = setTimeout(() => {
        setWasOffline(false);
        wasOfflineTimerRef.current = null;
      }, BACK_ONLINE_DISPLAY_MS);
    }

    previousOnlineRef.current = true;
  }, []);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    previousOnlineRef.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);

      if (wasOfflineTimerRef.current) {
        clearTimeout(wasOfflineTimerRef.current);
      }
    };
  }, [handleOnline, handleOffline]);

  return { isOnline, wasOffline };
}
