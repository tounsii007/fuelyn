// @vitest-environment jsdom

// ============================================================
// OnboardingModal — first-run welcome flow (behavioral). A sister
// spec (OnboardingModal.hydration.test.tsx) pins the SSR mount-
// gate; this one drives the 3-step flow once hydrated: welcome →
// fuel pick → tips. We force the hydration gate open and use
// identity translations so step copy is asserted by key; the fuel
// buttons read their labels from core's FUEL_TYPE_LABELS ("Diesel"
// / "Super E5" / "Super E10"). Real store — the final CTA writes
// onboardingDone plus the chosen fuel type through to it.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useAppStore } from '@/lib/store/app-store';

vi.mock('@/lib/hooks/use-is-hydrated', () => ({ useIsHydrated: () => true }));
vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { OnboardingModal } from '../onboarding/OnboardingModal';

describe('OnboardingModal — flow', () => {
  beforeEach(() => {
    useAppStore.setState({ onboardingDone: false });
  });
  afterEach(() => cleanup());

  it('renders nothing once onboarding is complete', () => {
    useAppStore.setState({ onboardingDone: true });
    const { container } = render(<OnboardingModal />);
    expect(container.firstChild).toBeNull();
  });

  it('opens on the welcome step and completes immediately when skipped', () => {
    render(<OnboardingModal />);
    expect(screen.getByRole('heading', { name: 'onboarding.welcome' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.skip' }));
    expect(useAppStore.getState().onboardingDone).toBe(true);
  });

  it('walks welcome → fuel → tips and persists the chosen fuel type', () => {
    render(<OnboardingModal />);

    // Step 0 → continue.
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.continue' }));

    // Step 1: choose Diesel, then continue (applies the selection).
    expect(screen.getByRole('heading', { name: 'onboarding.fuelQuestion' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Diesel' }));
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.continue' }));

    // Step 2: tips, then finish.
    expect(screen.getByRole('heading', { name: 'onboarding.howItWorks' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.getStarted' }));

    const state = useAppStore.getState();
    expect(state.onboardingDone).toBe(true);
    expect(state.filter.fuelType).toBe('diesel');
    expect(state.settings.defaultFuelType).toBe('diesel');
  });
});
