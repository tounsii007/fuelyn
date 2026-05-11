// ============================================================
// WebVitalsReporter — silent perf telemetry collector.
//
// Phase A3. Subscribes to Next.js's built-in Web Vitals stream
// (LCP, INP, CLS, FCP, TTFB) and POSTs each measurement to the
// BFF where it's persisted in Postgres for dashboarding.
//
// Uses `navigator.sendBeacon` so the request survives a page
// unload (the most interesting LCP/INP samples often arrive on
// the way out). Falls back to fetch() with keepalive for
// browsers without sendBeacon.
//
// Privacy: we only send the metric name + value + an opaque
// session-id (random per page load). No PII, no IP-fingerprint,
// no URL parameters.
// ============================================================

'use client';

import { useReportWebVitals } from 'next/web-vitals';
import { useEffect, useRef } from 'react';

export function WebVitalsReporter() {
  // Random opaque per-page-load id — lets us aggregate metrics
  // belonging to the same session without storing anything that
  // could identify the user. Assigned inside an effect so the
  // initial-value call doesn't run an impure function during render.
  const sessionIdRef = useRef<string>('');
  useEffect(() => {
    if (sessionIdRef.current) return;
    sessionIdRef.current =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
  }, []);

  useReportWebVitals((metric) => {
    const payload = JSON.stringify({
      name: metric.name,           // 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB'
      value: Math.round(metric.value * 1000) / 1000,
      rating: metric.rating,       // 'good' | 'needs-improvement' | 'poor'
      sessionId: sessionIdRef.current,
      pathname: typeof window !== 'undefined' ? window.location.pathname : '',
      ts: Date.now(),
    });

    // sendBeacon is fire-and-forget and survives navigation —
    // exactly what we want for a metric that often fires during
    // unload. Returns false when the user agent rate-limits us
    // (e.g. > 64 KB queued); fall back to fetch.
    let ok = false;
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      try {
        ok = navigator.sendBeacon('/api/web-vitals', payload);
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      // keepalive ensures the request finishes even if the page is
      // closing. Body is intentionally text (not JSON) because the
      // BFF parses it as raw bytes either way.
      fetch('/api/web-vitals', {
        method: 'POST',
        body: payload,
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {
        // Telemetry is best-effort. A failed metric never breaks UX.
      });
    }
  });

  return null;
}
