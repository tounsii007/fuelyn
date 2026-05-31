// @vitest-environment jsdom

// ============================================================
// OpeningHoursDetail — locale-aware "Öffnungszeiten" panel. Three
// render modes: all-day banner, empty (null), and the 7-day grid
// with a holiday-overrides section.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { OpeningTime } from '@fuelyn/core';
import { OpeningHoursDetail } from '../stations/OpeningHoursDetail';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

afterEach(() => cleanup());

describe('OpeningHoursDetail', () => {
  it('shows the all-day banner when wholeDay is set', () => {
    render(<OpeningHoursDetail openingTimes={[]} wholeDay overrides={[]} isOpen />);
    expect(screen.getByText('openingHours.allDayHeading')).toBeInTheDocument();
    expect(screen.getByText('openingHours.allDayDesc')).toBeInTheDocument();
  });

  it('renders nothing when there are no opening times', () => {
    const { container } = render(
      <OpeningHoursDetail openingTimes={[]} wholeDay={false} overrides={[]} isOpen />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the weekly grid with an open heading and time slots', () => {
    const times: OpeningTime[] = [{ text: 'Montag', start: '08:00', end: '20:00' }];
    const { container } = render(
      <OpeningHoursDetail openingTimes={times} wholeDay={false} overrides={[]} isOpen />,
    );
    expect(screen.getByText('station.open')).toBeInTheDocument();
    expect(container.textContent).toContain('08:00');
    expect(container.textContent).toContain('20:00');
    // Tue–Sun carry no slots → six "closed" cells in the grid.
    expect(screen.getAllByText('station.closed')).toHaveLength(6);
  });

  it('lists holiday overrides under their own heading', () => {
    const times: OpeningTime[] = [{ text: 'Montag', start: '08:00', end: '20:00' }];
    render(
      <OpeningHoursDetail
        openingTimes={times}
        wholeDay={false}
        overrides={['24.12. geschlossen']}
        isOpen={false}
      />,
    );
    expect(screen.getByText('openingHours.holidays')).toBeInTheDocument();
    expect(screen.getByText('24.12. geschlossen')).toBeInTheDocument();
  });
});
