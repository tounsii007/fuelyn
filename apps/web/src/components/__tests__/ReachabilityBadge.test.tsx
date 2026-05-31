// @vitest-environment jsdom

// ============================================================
// ReachabilityBadge — status pill (safe / tight / unreachable).
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ReachabilityBadge } from '../ui/ReachabilityBadge';

afterEach(() => cleanup());

describe('ReachabilityBadge', () => {
  it('renders the German label for each status', () => {
    const cases = [
      ['safe', 'Sicher erreichbar'],
      ['tight', 'Knapp erreichbar'],
      ['unreachable', 'Nicht erreichbar'],
    ] as const;
    cases.forEach(([status, label]) => {
      const { unmount } = render(<ReachabilityBadge status={status} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    });
  });

  it('applies status-specific colour tokens', () => {
    const { container } = render(<ReachabilityBadge status="safe" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/text-reach-safe/);
    expect(root.className).toMatch(/bg-reach-safe\/10/);
  });

  it('renders a status dot inside the pill', () => {
    const { container } = render(<ReachabilityBadge status="tight" />);
    const dot = container.querySelector('span > span');
    expect(dot?.className).toMatch(/bg-reach-tight/);
    expect(dot?.className).toMatch(/rounded-full/);
  });

  it('forwards a custom className', () => {
    const { container } = render(<ReachabilityBadge status="unreachable" className="custom-cls" />);
    expect(container.firstElementChild?.className).toMatch(/custom-cls/);
  });
});
