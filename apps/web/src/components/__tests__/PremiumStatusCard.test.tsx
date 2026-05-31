// @vitest-environment jsdom

// ============================================================
// PremiumStatusCard — settings subscription panel. Free users see
// the upgrade tiers; premium users see the manage-portal control +
// status badge. Telemetry + the billing fetch are stubbed.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { useAppStore } from '@/lib/store/app-store';

const { trackMock } = vi.hoisted(() => ({ trackMock: vi.fn() }));

vi.mock('@/lib/hooks/use-telemetry', () => ({ track: trackMock }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: vi.fn() }) }));
vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { PremiumStatusCard } from '../billing/PremiumStatusCard';

describe('PremiumStatusCard', () => {
  beforeEach(() => {
    trackMock.mockClear();
    useAppStore.setState({ subscription: { status: 'free', plan: null } });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('offers the upgrade tiers to free users', () => {
    render(<PremiumStatusCard />);
    expect(screen.getByText('premium.statusFree')).toBeInTheDocument();
    expect(screen.getByText('3,99 €/Monat')).toBeInTheDocument();
    expect(screen.getByText('29,99 €/Jahr')).toBeInTheDocument();
    expect(screen.queryByText('premium.managePortalCta')).toBeNull();
    expect(screen.queryByText('premium.activeBadge')).toBeNull();
  });

  it('shows the manage-portal control and badge for premium users', () => {
    useAppStore.setState({
      subscription: {
        status: 'active',
        plan: 'annual',
        currentPeriodEnd: new Date(Date.now() + 30 * 864e5).toISOString(),
      },
    });
    render(<PremiumStatusCard />);
    expect(screen.getByText('premium.statusActive')).toBeInTheDocument();
    expect(screen.getByText('premium.activeBadge')).toBeInTheDocument();
    expect(screen.getByText('premium.managePortalCta')).toBeInTheDocument();
    expect(screen.getByText(/premium\.daysRemaining/)).toBeInTheDocument();
    expect(screen.queryByText('3,99 €/Monat')).toBeNull();
  });

  it('starts a monthly checkout via telemetry + the billing API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ stub: false }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<PremiumStatusCard />);
    await act(async () => {
      fireEvent.click(screen.getByText('3,99 €/Monat'));
    });
    expect(trackMock).toHaveBeenCalledWith('premium.checkout-started', 'monthly');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/billing/checkout',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
