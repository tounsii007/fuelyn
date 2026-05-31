// @vitest-environment jsdom

// ============================================================
// FuelAdvisor — refuel-now-or-wait card. Always renders: it
// starts from the local heuristic (analyzePrices /
// getMockRecommendation, real) and upgrades to the AI advisor
// when useAIAdvisor resolves. The footer label distinguishes the
// three states (heuristic / loading / AI-powered) and a
// confidence indicator is always present. Copy is hardcoded
// German; useAIAdvisor is mocked, real store + core heuristic.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { FUEL_TYPE_LABELS } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';

const { aiAdvisorMock } = vi.hoisted(() => ({ aiAdvisorMock: vi.fn() }));

vi.mock('@/lib/hooks/use-ai-advisor', () => ({ useAIAdvisor: () => aiAdvisorMock() }));

import { FuelAdvisor } from '../intelligence/FuelAdvisor';

describe('FuelAdvisor', () => {
  beforeEach(() => {
    aiAdvisorMock.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    useAppStore.setState((s) => ({ filter: { ...s.filter, fuelType: 'e10' }, priceHistory: [] }));
  });
  afterEach(() => cleanup());

  it('falls back to the local heuristic with a confidence indicator', () => {
    render(<FuelAdvisor />);
    expect(screen.getByText(FUEL_TYPE_LABELS.e10)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Konfidenz:/)).toBeInTheDocument();
    expect(screen.getByText('KI-basierte Prognose')).toBeInTheDocument();
  });

  it('shows the loading state while the AI advisor is pending', () => {
    aiAdvisorMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<FuelAdvisor />);
    expect(screen.getByText('KI lädt...')).toBeInTheDocument();
  });

  it('prefers the AI recommendation once it resolves', () => {
    aiAdvisorMock.mockReturnValue({
      data: {
        recommendation: {
          action: 'buy_now',
          headline: 'AI sagt jetzt tanken',
          explanation: 'Preis ist gerade niedrig.',
          bestTimePrediction: 'Heute Abend wird es teurer.',
          savingsEstimate: 0,
          confidence: 'high',
        },
      },
      isLoading: false,
      isError: false,
    });
    render(<FuelAdvisor />);
    expect(screen.getByText('AI sagt jetzt tanken')).toBeInTheDocument();
    expect(screen.getByText('KI-powered by GPT-4o')).toBeInTheDocument();
  });
});
