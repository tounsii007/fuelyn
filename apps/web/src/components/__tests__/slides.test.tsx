// @vitest-environment jsdom

// ============================================================
// Wrapped slides — the 11 exported "year in review" panels. They
// are pure: each takes a WrappedReport and renders headline copy
// (asserted by key under identity translations) plus real report
// data (brand, weekday, month name). Five slides self-suppress
// when their datum is missing — Distance ≤ 0 km, no top brand, no
// cheapest tank, an empty weekday table, no most-frequent month —
// so we assert both the populated and the null branches. CountUp
// reads window.matchMedia (absent in jsdom); we stub it to the
// reduced-motion branch, which commits the final value at once.
// Identity translations expose locale 'de', so month names render
// in German (index 4 → "Mai").
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { WrappedReport, FuelLogEntry } from '@fuelyn/core';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import {
  CoverSlide,
  LitersSlide,
  MoneySlide,
  DistanceSlide,
  Co2Slide,
  TopBrandSlide,
  CheapestSlide,
  BestDaySlide,
  SavingsSlide,
  FrequencySlide,
  OutroSlide,
} from '../wrapped/slides';

function makeEntry(over: Partial<FuelLogEntry> = {}): FuelLogEntry {
  return {
    id: 'e1',
    date: '2025-03-14T10:00:00.000Z',
    stationName: 'Aral Marburg',
    stationBrand: 'Aral',
    fuelType: 'e10',
    liters: 42,
    pricePerLiter: 1.659,
    totalCost: 69.68,
    ...over,
  };
}

function makeReport(over: Partial<WrappedReport> = {}): WrappedReport {
  return {
    year: 2025,
    hasMinimumData: true,
    totals: {
      entries: 24,
      liters: 1234,
      eur: 2100,
      co2Kg: 2900,
      distinctStations: 12,
      distinctBrands: 5,
    },
    averages: {
      pricePerLiter: 1.789,
      costPerVisit: 87.5,
      litersPerVisit: 51.4,
    },
    distance: {
      km: 18000,
      avgConsumptionLPer100Km: 6.9,
    },
    highlights: {
      cheapest: { id: 'h1', entry: makeEntry(), headline: 'Billigster Tank' },
      mostExpensive: null,
      biggestFillUp: null,
    },
    topBrand: { brand: 'Aral', visits: 9, totalEur: 800, totalLiters: 450 },
    dayOfWeekPattern: [{ dayIndex: 1, label: 'Montag', avgPricePerLiter: 1.759, visits: 6 }],
    savingsVsAverage: { marketAvgPricePerLiter: 1.81, diffEur: -42.5, diffPercent: -2.3 },
    streaks: { longestGapDays: 14, mostFrequentMonth: { month: 4, visits: 7 } },
    ...over,
  };
}

// jsdom ships no matchMedia; CountUp reads it on mount. The
// reduced-motion branch makes CountUp commit its final value
// synchronously (no requestAnimationFrame left pending).
function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe('Wrapped slides', () => {
  beforeEach(() => stubMatchMedia(true));
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, 'matchMedia');
  });

  it('CoverSlide renders the headline', () => {
    render(<CoverSlide report={makeReport()} />);
    expect(screen.getByRole('heading', { name: 'wrapped.coverHeadline' })).toBeInTheDocument();
  });

  it('LitersSlide renders its eyebrow and unit', () => {
    render(<LitersSlide report={makeReport()} />);
    expect(screen.getByText('wrapped.litersEyebrow')).toBeInTheDocument();
    expect(screen.getByText('wrapped.litersUnit')).toBeInTheDocument();
  });

  it('MoneySlide renders its eyebrow', () => {
    render(<MoneySlide report={makeReport()} />);
    expect(screen.getByText('wrapped.moneyEyebrow')).toBeInTheDocument();
  });

  it('Co2Slide renders its unit', () => {
    render(<Co2Slide report={makeReport()} />);
    expect(screen.getByText('wrapped.co2Unit')).toBeInTheDocument();
  });

  it('SavingsSlide shows the "beat the market" eyebrow when the user saved', () => {
    render(<SavingsSlide report={makeReport()} />); // diffEur < 0 → user beat the market
    expect(screen.getByText('wrapped.savingsEyebrowBeat')).toBeInTheDocument();
  });

  it('OutroSlide renders the closing headline', () => {
    render(<OutroSlide report={makeReport()} />);
    expect(screen.getByRole('heading', { name: 'wrapped.outroHeadline' })).toBeInTheDocument();
  });

  it('DistanceSlide renders when km > 0 but suppresses itself at 0 km', () => {
    const { container, rerender } = render(<DistanceSlide report={makeReport()} />);
    expect(screen.getByText('wrapped.distanceUnit')).toBeInTheDocument();

    rerender(
      <DistanceSlide report={makeReport({ distance: { km: 0, avgConsumptionLPer100Km: null } })} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('TopBrandSlide shows the brand but suppresses itself without one', () => {
    const { container, rerender } = render(<TopBrandSlide report={makeReport()} />);
    expect(screen.getByText('Aral')).toBeInTheDocument();

    rerender(<TopBrandSlide report={makeReport({ topBrand: null })} />);
    expect(container.firstChild).toBeNull();
  });

  it('CheapestSlide renders the eyebrow but suppresses itself without a cheapest tank', () => {
    const { container, rerender } = render(<CheapestSlide report={makeReport()} />);
    expect(screen.getByText('wrapped.cheapestEyebrow')).toBeInTheDocument();

    rerender(
      <CheapestSlide
        report={makeReport({
          highlights: { cheapest: null, mostExpensive: null, biggestFillUp: null },
        })}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('BestDaySlide shows the weekday but suppresses itself with no pattern', () => {
    const { container, rerender } = render(<BestDaySlide report={makeReport()} />);
    expect(screen.getByText('Montag')).toBeInTheDocument();

    rerender(<BestDaySlide report={makeReport({ dayOfWeekPattern: [] })} />);
    expect(container.firstChild).toBeNull();
  });

  it('FrequencySlide shows the month but suppresses itself without one', () => {
    const { container, rerender } = render(<FrequencySlide report={makeReport()} />);
    expect(screen.getByText('Mai')).toBeInTheDocument(); // month index 4 → Mai (de)

    rerender(
      <FrequencySlide
        report={makeReport({ streaks: { longestGapDays: 0, mostFrequentMonth: null } })}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
