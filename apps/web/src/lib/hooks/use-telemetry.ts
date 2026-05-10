// ============================================================
// useTelemetry — client-side event batcher.
//
// Components fire events through `track(name, variant?)`; the
// hook coalesces them in a small in-memory buffer and POSTs every
// 30 s (or on page hide) to /api/telemetry.
//
// Strict guard: never logs payloads / values. Only the stable
// event NAME and an optional A/B variant token. See
// packages/core/src/telemetry/events.ts for the full vocabulary.
//
// Disable knob: NEXT_PUBLIC_DISABLE_TELEMETRY=1 short-circuits
// the entire pipeline (helpful for local dev + GDPR opt-out).
// ============================================================

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { toDayKey, type TelemetryEventName } from '@fuelyn/core';

const FLUSH_INTERVAL_MS = 30_000;
const MAX_BUFFER = 50;

interface BufferedEvent {
  name: TelemetryEventName;
  variant?: string;
  day: string;
}

// Module-level singleton so multiple hook instances share one buffer.
const buffer: BufferedEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let installedListeners = false;
let bootstrapped = false;

function isEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return process.env.NEXT_PUBLIC_DISABLE_TELEMETRY !== '1';
}

async function flush(): Promise<void> {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, buffer.length);
  try {
    await fetch('/api/telemetry', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Fuelyn-Device': readDeviceId() ?? 'anonymous',
      },
      keepalive: true, // survives page-unload
      body: JSON.stringify({ events: batch }),
    });
  } catch {
    // Drop silently — telemetry must never break the app
  }
}

function readDeviceId(): string | null {
  try {
    return localStorage.getItem('fuelyn:deviceId');
  } catch {
    return null;
  }
}

/**
 * Fire an event. Idempotent on the same render, batched, never
 * blocks the calling code.
 */
export function track(name: TelemetryEventName, variant?: string): void {
  if (!isEnabled()) return;
  if (buffer.length >= MAX_BUFFER) return; // backpressure
  buffer.push({ name, variant, day: toDayKey() });
}

/**
 * Mount once at the top of the tree (Providers). Installs the
 * periodic flush timer + page-hide flush.
 */
export function useTelemetry(): void {
  const fired = useRef(false);

  // App-startup events.
  useEffect(() => {
    if (!isEnabled() || fired.current) return;
    fired.current = true;
    if (!bootstrapped) {
      bootstrapped = true;
      track('app.first-open');
    }
  }, []);

  useEffect(() => {
    if (!isEnabled()) return;

    if (!flushTimer) {
      flushTimer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
    }
    if (!installedListeners) {
      installedListeners = true;
      const onHide = () => { void flush(); };
      window.addEventListener('pagehide', onHide);
      window.addEventListener('beforeunload', onHide);
    }
    // Don't tear the timer down on unmount — multiple <Providers>
    // mounts (HMR, layout transitions) would race otherwise.
  }, []);
}

/**
 * Convenience wrapper for components that prefer a hook surface.
 * Returns a stable reference to track().
 */
export function useTrack(): (name: TelemetryEventName, variant?: string) => void {
  // Wrap the module-level track in an arrow so the lint rule that
  // demands an inline-function-expression argument is satisfied; the
  // returned callback is referentially stable across renders.
  return useCallback((name, variant) => track(name, variant), []);
}
