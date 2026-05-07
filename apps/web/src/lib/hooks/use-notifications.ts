// ============================================================
// TankPilot Web — Push Notification Hook
// Manages browser notification permission, service worker
// push subscription, and test notification dispatch.
// ============================================================

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store/app-store';

/** Whether the Notification API is available in this browser. */
function checkSupport(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator
  );
}

export interface UseNotificationsReturn {
  /** True when the browser supports the Notification API + service workers. */
  isSupported: boolean;
  /** Current notification permission state, or null if not yet queried. */
  permission: NotificationPermission | null;
  /** Request permission and register the push subscription. */
  subscribe: () => Promise<void>;
  /** Unregister push subscription. */
  unsubscribe: () => Promise<void>;
  /** Show a local test notification via the service worker. */
  sendTestNotification: () => Promise<void>;
}

export function useNotifications(): UseNotificationsReturn {
  const isSupported = useMemo(() => checkSupport(), []);

  const storePermission = useAppStore((s) => s.notificationPermission);
  const setNotificationPermission = useAppStore(
    (s) => s.setNotificationPermission,
  );

  // Keep a local mirror so we can react to Notification.permission changes
  const [localPermission, setLocalPermission] =
    useState<NotificationPermission | null>(storePermission);

  // Sync the browser's current permission on mount
  useEffect(() => {
    if (!isSupported) return;
    const current = Notification.permission;
    setLocalPermission(current);
    setNotificationPermission(current);
  }, [isSupported, setNotificationPermission]);

  // ------------------------------------------------------------------
  // subscribe — request permission + register the SW
  // ------------------------------------------------------------------
  const subscribe = useCallback(async () => {
    if (!isSupported) return;

    let perm = Notification.permission;

    if (perm === 'default') {
      perm = await Notification.requestPermission();
    }

    setLocalPermission(perm);
    setNotificationPermission(perm);

    if (perm !== 'granted') return;

    // Ensure the service worker is ready
    try {
      const registration = await navigator.serviceWorker.ready;

      // Check for an existing subscription first
      const existing = await registration.pushManager.getSubscription();
      if (!existing) {
        // In a real app you would pass the VAPID applicationServerKey here.
        // For now we create a subscription without a server key so the
        // client-side logic compiles and works for local test notifications.
        try {
          await registration.pushManager.subscribe({
            userVisibleOnly: true,
          });
        } catch {
          // pushManager.subscribe may fail without a VAPID key on some
          // browsers — that's fine, local notifications still work.
          if (process.env.NODE_ENV !== 'production') {
            console.info(
              '[TankPilot] Push subscription skipped (no VAPID key configured)',
            );
          }
        }
      }
    } catch {
      // Service worker not available — permission was still granted
      // so local Notification API fallback will work.
    }
  }, [isSupported, setNotificationPermission]);

  // ------------------------------------------------------------------
  // unsubscribe — remove the push subscription
  // ------------------------------------------------------------------
  const unsubscribe = useCallback(async () => {
    if (!isSupported) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
      }
    } catch {
      // Silently ignore — nothing to unsubscribe from.
    }
  }, [isSupported]);

  // ------------------------------------------------------------------
  // sendTestNotification — triggers a local notification via the SW
  // ------------------------------------------------------------------
  const sendTestNotification = useCallback(async () => {
    if (!isSupported || Notification.permission !== 'granted') return;

    try {
      const registration = await navigator.serviceWorker.ready;

      await registration.showNotification('TankPilot Preisalarm', {
        body: 'Super E10 bei Shell Hamburg f\u00FCr 1,489 \u20AC/L \u2014 unter deinem Wunschpreis!',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        tag: 'price-alert-test',
        data: {
          url: '/',
          stationId: 'test-station',
          fuelType: 'e10',
          price: 1.489,
        },
      });
    } catch {
      // Fallback to the basic Notification API when SW is unavailable
      new Notification('TankPilot Preisalarm', {
        body: 'Super E10 bei Shell Hamburg f\u00FCr 1,489 \u20AC/L \u2014 unter deinem Wunschpreis!',
        icon: '/icons/icon-192x192.png',
      });
    }
  }, [isSupported]);

  return {
    isSupported,
    permission: localPermission,
    subscribe,
    unsubscribe,
    sendTestNotification,
  };
}
