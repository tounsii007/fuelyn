// @vitest-environment jsdom

// ============================================================
// HeroEmptyState — welcome screen shown before geolocation is
// granted. Pure presentational: two CTAs + highlight chips +
// feature tiles, all labelled via the identity translation mock.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { HeroEmptyState } from '../layout/HeroEmptyState';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

afterEach(() => cleanup());

describe('HeroEmptyState', () => {
  it('renders the headline, body and privacy note', () => {
    render(<HeroEmptyState onRequestLocation={vi.fn()} onUseDemoLocation={vi.fn()} />);
    expect(screen.getByText('hero.headlinePart1')).toBeInTheDocument();
    expect(screen.getByText('hero.headlinePart2')).toBeInTheDocument();
    expect(screen.getByText('hero.body')).toBeInTheDocument();
    expect(screen.getByText('hero.privacyNote')).toBeInTheDocument();
  });

  it('renders both call-to-action buttons', () => {
    render(<HeroEmptyState onRequestLocation={vi.fn()} onUseDemoLocation={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'hero.ctaShare' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'hero.ctaDemo' })).toBeInTheDocument();
  });

  it('wires each CTA to its handler', () => {
    const onRequestLocation = vi.fn();
    const onUseDemoLocation = vi.fn();
    render(
      <HeroEmptyState onRequestLocation={onRequestLocation} onUseDemoLocation={onUseDemoLocation} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'hero.ctaShare' }));
    fireEvent.click(screen.getByRole('button', { name: 'hero.ctaDemo' }));
    expect(onRequestLocation).toHaveBeenCalledTimes(1);
    expect(onUseDemoLocation).toHaveBeenCalledTimes(1);
  });

  it('lists the highlight chips and feature tiles', () => {
    render(<HeroEmptyState onRequestLocation={vi.fn()} onUseDemoLocation={vi.fn()} />);
    ['hero.highlightLive', 'hero.highlightSmart', 'hero.highlightTrend', 'hero.highlightEv'].forEach(
      (k) => {
        expect(screen.getByText(k)).toBeInTheDocument();
      },
    );
    expect(screen.getByText('hero.featureSmartTitle')).toBeInTheDocument();
    expect(screen.getByText('hero.featureMarketTitle')).toBeInTheDocument();
    expect(screen.getByText('hero.featureBestTimeTitle')).toBeInTheDocument();
  });
});
