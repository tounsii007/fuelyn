// ============================================================
// usePriceStream — live price updates over Server-Sent Events
//
// Subscribes to /api/v1/stream/prices and yields a stream of
// PriceUpdatedEvent records. The browser's native EventSource
// auto-reconnects on transient failures; on hard 4xx/5xx we back
// off ourselves with exponential delay.
// ============================================================

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface PriceUpdatedEvent {
  readonly stationId: string;
  readonly stationName: string;
  readonly brand: string;
  readonly fuelType: 'diesel' | 'e5' | 'e10';
  readonly newPrice: number;
  readonly previousPrice: number | null;
  readonly deltaPrice: number | null;
  readonly observedAt: string;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly postCode: string | null;
}

interface PriceEnvelope<T> {
  readonly id: string;
  readonly type: string;
  readonly source: string;
  readonly time: string;
  readonly schemaVersion: number;
  readonly data: T;
}

export interface UsePriceStreamOptions {
  /** Optional list of station IDs to filter on. Empty → all. */
  readonly stationIds?: readonly string[];
  /** Disable the stream (e.g. in tests, on unmount). */
  readonly enabled?: boolean;
}

export interface UsePriceStreamResult {
  readonly connected: boolean;
  readonly latestEvent: PriceUpdatedEvent | null;
  readonly eventCount: number;
  /** Imperative subscribe — fires on each event in arrival order. */
  readonly subscribe: (handler: (event: PriceUpdatedEvent) => void) => () => void;
}

/**
 * Hook: connect to the SSE bridge and surface live price events.
 *
 * @example
 * const { latestEvent, eventCount } = usePriceStream({ stationIds: ['ABC123'] });
 */
export function usePriceStream(options: UsePriceStreamOptions = {}): UsePriceStreamResult {
  const { stationIds, enabled = true } = options;
  const [connected, setConnected] = useState(false);
  const [latestEvent, setLatestEvent] = useState<PriceUpdatedEvent | null>(null);
  const [eventCount, setEventCount] = useState(0);

  // Subscriber callbacks live in a ref so adding one doesn't reconnect.
  const handlersRef = useRef<Set<(e: PriceUpdatedEvent) => void>>(new Set());

  const subscribe = useCallback((handler: (e: PriceUpdatedEvent) => void) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  // Stable serialised station-id list — used in the URL and as a
  // dependency for the connection effect. Re-deriving on every render
  // is fine because join() on a small array is cheap.
  const stationsCsv = stationIds && stationIds.length > 0 ? stationIds.join(',') : '';

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const filter = stationsCsv ? `?stations=${stationsCsv}` : '';
    // BFF route — proxies to the gateway with server-side API key
    const url = `/api/stream/prices${filter}`;

    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const connect = () => {
      es = new EventSource(url, { withCredentials: true });

      es.addEventListener('open', () => {
        setConnected(true);
        attempt = 0;
      });

      es.addEventListener('hello', () => {
        // server's initial connection-confirmed event
      });

      es.addEventListener('price.updated', (raw) => {
        try {
          const env = JSON.parse((raw as MessageEvent).data) as PriceEnvelope<PriceUpdatedEvent>;
          if (!env.data) return;
          setLatestEvent(env.data);
          setEventCount((c) => c + 1);
          handlersRef.current.forEach((h) => h(env.data));
        } catch {
          // ignore malformed payload
        }
      });

      es.addEventListener('error', () => {
        // EventSource will auto-reconnect, but if the server returns
        // 401/403 it gives up. Manually retry with exp backoff.
        setConnected(false);
        if (es?.readyState === EventSource.CLOSED) {
          attempt += 1;
          const delayMs = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5));
          reconnectTimer = setTimeout(connect, delayMs);
        }
      });
    };

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
      setConnected(false);
    };
  }, [enabled, stationsCsv]);

  return { connected, latestEvent, eventCount, subscribe };
}
