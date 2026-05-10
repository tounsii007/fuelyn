// ============================================================
// useCloudSync — opportunistic localStorage ↔ /api/sync mirror.
//
// Behaviour:
//   * On mount: if no local deviceId, generate one and POST a
//     pull. Take any newer server records and write them into
//     localStorage (the existing useHydrateStore picks them up
//     on next render).
//   * On every store change for the slices we care about, debounce
//     and POST a push with the slice's current value.
//
// All requests carry the X-Fuelyn-Device header. The /api/sync
// endpoint mints a session JWT cookie on first hit; subsequent
// requests piggy-back on the cookie for free.
// ============================================================

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@/lib/store/app-store';

const DEVICE_ID_KEY = 'fuelyn:deviceId';
const DEBOUNCE_MS = 1500;

type SyncableKind =
  | 'fuel-log'
  | 'vehicles'
  | 'active-vehicle'
  | 'memberships'
  | 'settings'
  | 'subscription';

function getOrCreateDeviceId(): string | null {
  if (typeof window === 'undefined') return null;
  let id = window.localStorage.getItem(DEVICE_ID_KEY);
  if (id && id.length >= 8 && id.length <= 64) return id;
  // Use crypto.randomUUID when available, fall back to a simple
  // base36 random for older runtimes.
  id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  window.localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

interface PullResult {
  records: Array<{ kind: string; payload: string; updatedAt: string }>;
}

async function pull(deviceId: string): Promise<PullResult | null> {
  try {
    const res = await fetch('/api/sync', {
      method: 'GET',
      credentials: 'include',
      headers: { 'X-Fuelyn-Device': deviceId },
    });
    if (!res.ok) return null;
    return (await res.json()) as PullResult;
  } catch {
    return null;
  }
}

async function push(
  deviceId: string,
  records: Array<{ kind: SyncableKind; payload: string; updatedAt: string }>,
): Promise<boolean> {
  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Fuelyn-Device': deviceId,
        // CSRF guard — endpoint requires this custom header on every
        // state-changing request (Iter AH).
        'X-Fuelyn-Csrf': '1',
      },
      body: JSON.stringify({ records }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Hook that runs the sync lifecycle. Call once at the top of the
 * tree (alongside useHydrateStore). The hook is a no-op when
 * NEXT_PUBLIC_DISABLE_SYNC=1 — handy for local dev when you don't
 * want a backend round-trip on every store mutation.
 */
export function useCloudSync(): void {
  const enabled =
    typeof window !== 'undefined' &&
    process.env.NEXT_PUBLIC_DISABLE_SYNC !== '1';

  const fuelLog = useAppStore((s) => s.fuelLog);
  const vehicles = useAppStore((s) => s.vehicles);
  const activeVehicleId = useAppStore((s) => s.activeVehicleId);
  const settings = useAppStore((s) => s.settings);
  const memberships = useAppStore((s) => s.activeMemberships);
  const subscription = useAppStore((s) => s.subscription);
  const setFuelLog = useAppStore((s) => s.setFuelLog);
  const setVehicles = useAppStore((s) => s.setVehicles);
  const setActiveVehicleId = useAppStore((s) => s.setActiveVehicleId);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const setActiveMemberships = useAppStore((s) => s.setActiveMemberships);
  const setSubscription = useAppStore((s) => s.setSubscription);

  const deviceIdRef = useRef<string | null>(null);
  const pushedRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial pull on mount.
  useEffect(() => {
    if (!enabled) return;
    const deviceId = getOrCreateDeviceId();
    if (!deviceId) return;
    deviceIdRef.current = deviceId;

    void (async () => {
      const result = await pull(deviceId);
      if (!result) return;
      for (const r of result.records) {
        try {
          const payload = JSON.parse(r.payload);
          switch (r.kind) {
            case 'fuel-log':
              if (Array.isArray(payload)) setFuelLog(payload);
              break;
            case 'vehicles':
              if (Array.isArray(payload)) setVehicles(payload);
              break;
            case 'active-vehicle':
              if (typeof payload === 'string' || payload === null) setActiveVehicleId(payload);
              break;
            case 'memberships':
              if (Array.isArray(payload)) setActiveMemberships(payload);
              break;
            case 'settings':
              if (payload && typeof payload === 'object') updateSettings(payload);
              break;
            case 'subscription':
              if (payload && typeof payload === 'object' && 'status' in payload) {
                setSubscription(payload);
              }
              break;
          }
        } catch {
          // ignore — server will overwrite on next push if local is newer
        }
      }
      pushedRef.current = true; // skip the next debounced push
    })();

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [
    enabled,
    setFuelLog,
    setVehicles,
    setActiveVehicleId,
    setActiveMemberships,
    updateSettings,
    setSubscription,
  ]);

  // Debounced push on state change.
  const queuePush = useCallback(() => {
    if (!enabled || !deviceIdRef.current) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      const deviceId = deviceIdRef.current;
      if (!deviceId) return;
      const now = new Date().toISOString();
      const records: Array<{ kind: SyncableKind; payload: string; updatedAt: string }> = [
        { kind: 'fuel-log', payload: JSON.stringify(fuelLog), updatedAt: now },
        { kind: 'vehicles', payload: JSON.stringify(vehicles), updatedAt: now },
        { kind: 'active-vehicle', payload: JSON.stringify(activeVehicleId), updatedAt: now },
        { kind: 'memberships', payload: JSON.stringify(memberships), updatedAt: now },
        { kind: 'settings', payload: JSON.stringify(settings), updatedAt: now },
        { kind: 'subscription', payload: JSON.stringify(subscription), updatedAt: now },
      ];
      void push(deviceId, records);
    }, DEBOUNCE_MS);
  }, [enabled, fuelLog, vehicles, activeVehicleId, memberships, settings, subscription]);

  useEffect(() => {
    if (!enabled || !pushedRef.current) return;
    queuePush();
  }, [enabled, queuePush, fuelLog, vehicles, activeVehicleId, memberships, settings, subscription]);
}
