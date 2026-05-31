// @vitest-environment jsdom

// ============================================================
// PriceAlertSettings — push-notification preferences. Renders a
// titled section with a master toggle, a permission status row
// and one threshold input per fuel type (disabled until alerts
// are enabled with granted permission). Enabling subscribes via
// useNotifications and flips the store flag; editing a threshold
// persists through the store. Identity translations; the
// notifications hook is mocked, real store.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { useAppStore } from '@/lib/store/app-store';

const { notifState, subscribeMock, unsubscribeMock, sendTestMock } = vi.hoisted(() => ({
  notifState: { isSupported: true, permission: 'granted' as 'default' | 'granted' | 'denied' },
  subscribeMock: vi.fn(),
  unsubscribeMock: vi.fn(),
  sendTestMock: vi.fn(),
}));

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));
vi.mock('@/lib/hooks/use-notifications', () => ({
  useNotifications: () => ({
    isSupported: notifState.isSupported,
    permission: notifState.permission,
    subscribe: subscribeMock,
    unsubscribe: unsubscribeMock,
    sendTestNotification: sendTestMock,
  }),
}));

import { PriceAlertSettings } from '../notifications/PriceAlertSettings';

describe('PriceAlertSettings', () => {
  beforeEach(() => {
    notifState.isSupported = true;
    notifState.permission = 'granted';
    subscribeMock.mockReset();
    unsubscribeMock.mockReset();
    useAppStore.setState({
      priceAlertEnabled: false,
      priceAlertThreshold: { diesel: null, e5: null, e10: null },
    });
  });
  afterEach(() => cleanup());

  it('renders the title, master toggle and one disabled threshold per fuel', () => {
    render(<PriceAlertSettings />);
    expect(screen.getByRole('heading', { name: 'priceAlertSettings.sectionTitle' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'priceAlertSettings.enableAria' })).toBeInTheDocument();
    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs).toHaveLength(3);
    expect(inputs[0]).toBeDisabled();
  });

  it('subscribes and enables alerts when the master toggle is pressed', async () => {
    render(<PriceAlertSettings />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'priceAlertSettings.enableAria' }));
    });
    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().priceAlertEnabled).toBe(true);
  });

  it('persists a per-fuel threshold once alerts are active', () => {
    useAppStore.setState({ priceAlertEnabled: true });
    render(<PriceAlertSettings />);
    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs[0]).toBeEnabled();
    fireEvent.change(inputs[0]!, { target: { value: '1.5' } });
    // FUEL_TYPES order is [e5, e10, diesel] → first input maps to e5.
    expect(useAppStore.getState().priceAlertThreshold.e5).toBe(1.5);
  });
});
