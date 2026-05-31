// @vitest-environment jsdom

// ============================================================
// CountUp — RAF-driven number animation. jsdom has no matchMedia,
// so we stub it to drive the reduced-motion / animated branches.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { CountUp } from '../wrapped/CountUp';

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

afterEach(() => cleanup());

describe('CountUp', () => {
  it('jumps straight to the target when reduced motion is preferred', () => {
    stubMatchMedia(true);
    const { container } = render(<CountUp to={1234} />);
    // Default formatter is de-DE → "1.234".
    expect(container.querySelector('span')?.textContent).toBe('1.234');
  });

  it('applies a custom formatter to the resolved value', () => {
    stubMatchMedia(true);
    const { container } = render(<CountUp to={42} format={(n) => `${Math.round(n)} €`} />);
    expect(container.querySelector('span')?.textContent).toBe('42 €');
  });

  it('forwards className to the rendered span', () => {
    stubMatchMedia(true);
    const { container } = render(<CountUp to={5} className="text-3xl font-bold" />);
    expect(container.querySelector('span')?.getAttribute('class')).toMatch(/text-3xl/);
  });

  it('starts at zero before the animation advances when motion is allowed', () => {
    stubMatchMedia(false);
    const { container } = render(<CountUp to={9999} />);
    // requestAnimationFrame hasn't fired synchronously, so the first
    // committed frame still reads the initial 0.
    expect(container.querySelector('span')?.textContent).toBe('0');
  });
});
