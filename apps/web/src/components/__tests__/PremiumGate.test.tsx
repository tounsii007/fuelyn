// @vitest-environment jsdom

// ============================================================
// PremiumGate — entitlement wrapper. Renders children when the
// active subscription unlocks the feature, otherwise a fallback
// (custom or the default upgrade banner). Logic lives in core's
// isFeatureUnlocked; here we drive it via the real store.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useAppStore } from '@/lib/store/app-store';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { PremiumGate } from '../billing/PremiumGate';

describe('PremiumGate', () => {
  beforeEach(() => {
    useAppStore.setState({ subscription: { status: 'free', plan: null } });
  });
  afterEach(() => cleanup());

  it('renders children when the feature is unlocked', () => {
    useAppStore.setState({ subscription: { status: 'active', plan: 'monthly' } });
    render(
      <PremiumGate feature="ai-chat-pro">
        <p>secret content</p>
      </PremiumGate>,
    );
    expect(screen.getByText('secret content')).toBeInTheDocument();
    expect(screen.queryByText('premium.upgradeCta')).toBeNull();
  });

  it('shows the default locked banner for free users', () => {
    render(
      <PremiumGate feature="ai-chat-pro">
        <p>secret content</p>
      </PremiumGate>,
    );
    expect(screen.queryByText('secret content')).toBeNull();
    expect(screen.getByText('premium.upgradeCta')).toBeInTheDocument();
    expect(screen.getByText('premium.featureTitles.ai-chat-pro')).toBeInTheDocument();
  });

  it('renders a custom fallback instead of the default banner', () => {
    render(
      <PremiumGate feature="ai-chat-pro" fallback={<p>please upgrade</p>}>
        <p>secret content</p>
      </PremiumGate>,
    );
    expect(screen.getByText('please upgrade')).toBeInTheDocument();
    expect(screen.queryByText('secret content')).toBeNull();
    expect(screen.queryByText('premium.upgradeCta')).toBeNull();
  });
});
