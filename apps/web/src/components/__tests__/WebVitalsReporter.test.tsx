// @vitest-environment jsdom

// ============================================================
// WebVitalsReporter — silent perf-telemetry collector. Renders
// nothing; subscribes to Next.js's Web Vitals stream and ships
// each measurement to /api/web-vitals via navigator.sendBeacon
// (fire-and-forget, survives unload), falling back to a
// keepalive fetch() when sendBeacon is missing or rate-limited.
// We mock next/web-vitals to capture the reporter callback, then
// invoke it by hand and assert the transport. sendBeacon/fetch
// are stubbed (jsdom implements neither meaningfully).
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

type Metric = { name: string; value: number; rating: string; id: string };

// The component registers its reporter via useReportWebVitals on
// every render; the mock stashes the latest callback so the test
// can drive it directly. Must come from vi.hoisted — it's read
// inside the vi.mock factory below (which is hoisted above imports).
const { reportHolder } = vi.hoisted(() => ({
  reportHolder: { current: null as null | ((m: Metric) => void) },
}));

vi.mock('next/web-vitals', () => ({
  useReportWebVitals: (cb: (m: Metric) => void) => {
    reportHolder.current = cb;
  },
}));

import { WebVitalsReporter } from '../observability/WebVitalsReporter';

const METRIC: Metric = { name: 'LCP', value: 1234.5678, rating: 'good', id: 'm-1' };

describe('WebVitalsReporter', () => {
  let sendBeaconMock: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reportHolder.current = null;
    sendBeaconMock = vi.fn(() => true);
    fetchMock = vi.fn(() => Promise.resolve());
    // jsdom ships no real sendBeacon — define one so the component's
    // `'sendBeacon' in navigator` guard takes the beacon path.
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      writable: true,
      value: sendBeaconMock,
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'sendBeacon');
  });

  it('renders nothing (silent collector)', () => {
    const { container } = render(<WebVitalsReporter />);
    expect(container.firstChild).toBeNull();
  });

  it('beacons each metric to /api/web-vitals', () => {
    render(<WebVitalsReporter />);
    expect(reportHolder.current).toBeTypeOf('function');

    reportHolder.current?.(METRIC);

    expect(sendBeaconMock).toHaveBeenCalledTimes(1);
    const call = sendBeaconMock.mock.calls[0]!;
    expect(call[0]).toBe('/api/web-vitals');
    expect(JSON.parse(String(call[1]))).toMatchObject({ name: 'LCP', rating: 'good' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to a keepalive fetch when sendBeacon is unavailable', () => {
    // sendBeacon returning false models a UA rate-limit / >64KB queue.
    sendBeaconMock.mockReturnValue(false);
    render(<WebVitalsReporter />);

    reportHolder.current?.(METRIC);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe('/api/web-vitals');
    expect(call[1]).toMatchObject({ method: 'POST', keepalive: true });
  });
});
