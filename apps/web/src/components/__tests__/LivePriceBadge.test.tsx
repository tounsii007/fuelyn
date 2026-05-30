// @vitest-environment jsdom

// ============================================================
// LivePriceBadge — live price-stream status pill (mocks the SSE hook).
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const streamMock = vi.hoisted(() => ({
  connected: false,
  eventCount: 0,
  latestEvent: null as null | { stationName: string; newPrice: number },
}));
vi.mock('@/lib/hooks/use-price-stream', () => ({
  usePriceStream: () => ({
    connected: streamMock.connected,
    eventCount: streamMock.eventCount,
    latestEvent: streamMock.latestEvent,
    subscribe: () => () => {},
  }),
}));

import { LivePriceBadge } from '../stations/LivePriceBadge';

describe('LivePriceBadge', () => {
  beforeEach(() => {
    streamMock.connected = false;
    streamMock.eventCount = 0;
    streamMock.latestEvent = null;
  });
  afterEach(() => cleanup());

  it('shows a connecting state until the stream connects', () => {
    render(<LivePriceBadge />);
    expect(screen.getByRole('status')).toHaveTextContent('Verbinde...');
  });

  it('shows "Live" once connected with no events yet', () => {
    streamMock.connected = true;
    render(<LivePriceBadge />);
    expect(screen.getByRole('status')).toHaveTextContent('Live');
  });

  it('renders the latest event station + price when available', () => {
    streamMock.connected = true;
    streamMock.eventCount = 3;
    streamMock.latestEvent = { stationName: 'Aral Mitte', newPrice: 1.789 };
    render(<LivePriceBadge />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveTextContent('Aral Mitte');
    expect(badge).toHaveTextContent('1.789');
  });

  it('renders nothing when visible=false', () => {
    streamMock.connected = true;
    const { container } = render(<LivePriceBadge visible={false} />);
    expect(container.firstChild).toBeNull();
  });
});
