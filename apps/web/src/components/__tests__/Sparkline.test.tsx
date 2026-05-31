// @vitest-environment jsdom

// ============================================================
// Sparkline — pure SVG price-trajectory with trend-coloured line.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Sparkline } from '../charts/Sparkline';

afterEach(() => cleanup());

const series = (prices: number[]) =>
  prices.map((price, i) => ({ price, timestamp: `2026-01-0${(i % 9) + 1}T00:00:00Z` }));

describe('Sparkline', () => {
  it('renders a decorative dashed baseline when there is no data', () => {
    const { container } = render(<Sparkline data={[]} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg?.querySelector('line')).not.toBeNull();
    expect(container.querySelector('[role="img"]')).toBeNull();
  });

  it('still shows the baseline for a single point (needs >= 2)', () => {
    const { container } = render(<Sparkline data={series([1.7])} />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('paints a trajectory with role=img + trend label for >= 2 points', () => {
    render(<Sparkline data={series([1.7, 1.69, 1.68])} />);
    const svg = screen.getByRole('img');
    expect(svg.getAttribute('aria-label')).toMatch(/Trend/);
    expect(svg.querySelector('path')).not.toBeNull();
    expect(svg.querySelector('circle')).not.toBeNull();
  });

  it('colours a falling trend emerald and a rising trend rose', () => {
    const { container: falling } = render(
      <Sparkline data={series([1.8, 1.7])} forceDirection="falling" />,
    );
    expect(falling.querySelector('path[stroke="#10B981"]')).not.toBeNull();

    const { container: rising } = render(
      <Sparkline data={series([1.7, 1.8])} forceDirection="rising" />,
    );
    expect(rising.querySelector('path[stroke="#F43F5E"]')).not.toBeNull();
  });

  it('honours a custom aria-label and dimensions', () => {
    render(
      <Sparkline data={series([1.7, 1.71])} ariaLabel="Sieben Tage" width={120} height={40} />,
    );
    const svg = screen.getByRole('img', { name: 'Sieben Tage' });
    expect(svg).toHaveAttribute('width', '120');
    expect(svg).toHaveAttribute('height', '40');
  });
});
