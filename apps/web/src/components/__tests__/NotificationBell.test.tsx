// @vitest-environment jsdom

// ============================================================
// NotificationBell — header bell with a two-tier indicator: a
// numeric pill counting armed price alarms (capped at "9+"),
// falling back to a dot when push is enabled but no rules exist.
// The dropdown (PriceAlertSettings) is only mounted on open, so
// these closed-state tests stay isolated. Copy is hardcoded German.
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { PriceAlert } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';

import { NotificationBell } from '../notifications/NotificationBell';

const alert = (over: Partial<PriceAlert> = {}): PriceAlert => ({
  id: 'a1',
  fuelType: 'e10',
  targetPrice: 1.7,
  enabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('NotificationBell', () => {
  beforeEach(() => {
    useAppStore.setState({ priceAlerts: [], priceAlertEnabled: false, notificationPermission: null });
  });
  afterEach(() => cleanup());

  it('renders a collapsed bell with no badge when nothing is armed', () => {
    render(<NotificationBell />);
    expect(screen.getByRole('button', { name: 'Preisalarm-Einstellungen' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByLabelText(/aktive Preisalarme/)).toBeNull();
  });

  it('shows the count of armed alarms on the pill', () => {
    useAppStore.setState({
      priceAlerts: [
        alert({ id: 'a', enabled: true }),
        alert({ id: 'b', enabled: true }),
        alert({ id: 'c', enabled: false }),
      ],
    });
    render(<NotificationBell />);
    expect(screen.getByLabelText('2 aktive Preisalarme')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('caps the pill at "9+" beyond nine armed alarms', () => {
    const many = Array.from({ length: 12 }, (_, i) => alert({ id: `a${i}`, enabled: true }));
    useAppStore.setState({ priceAlerts: many });
    render(<NotificationBell />);
    expect(screen.getByLabelText('12 aktive Preisalarme')).toBeInTheDocument();
    expect(screen.getByText('9+')).toBeInTheDocument();
  });
});
