// @vitest-environment jsdom

// ============================================================
// StationTypeIcon + EnergyTypeBadge — type-coded glyphs/labels.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StationTypeIcon, EnergyTypeBadge } from '../ui/StationTypeIcon';

afterEach(() => cleanup());

describe('StationTypeIcon', () => {
  it('renders the correct glyph per station type', () => {
    const cases = [
      ['fuel', '⛽'],
      ['charging', '⚡'],
      ['hydrogen', '💧'],
      ['gas', '🔥'],
    ] as const;
    cases.forEach(([type, glyph]) => {
      const { unmount } = render(<StationTypeIcon type={type} />);
      expect(screen.getByText(glyph)).toBeInTheDocument();
      unmount();
    });
  });

  it('applies type-specific colour classes', () => {
    const { container } = render(<StationTypeIcon type="charging" />);
    expect(container.firstElementChild?.className).toMatch(/bg-emerald-100/);
  });

  it('applies size classes (md default, sm/lg opt-in)', () => {
    const cases: Array<['sm' | 'md' | 'lg', RegExp]> = [
      ['sm', /w-6 h-6/],
      ['md', /w-8 h-8/],
      ['lg', /w-10 h-10/],
    ];
    cases.forEach(([size, re]) => {
      const { container, unmount } = render(<StationTypeIcon type="fuel" size={size} />);
      expect(container.firstElementChild?.className).toMatch(re);
      unmount();
    });
  });

  it('forwards a custom className', () => {
    const { container } = render(<StationTypeIcon type="fuel" className="custom-cls" />);
    expect(container.firstElementChild?.className).toMatch(/custom-cls/);
  });
});

describe('EnergyTypeBadge', () => {
  it('renders the short label per energy type', () => {
    const cases = [
      ['diesel', 'Diesel'],
      ['e5', 'E5'],
      ['e10', 'E10'],
      ['super_plus', 'S+'],
      ['h2', 'H₂'],
      ['ev_hpc', 'HPC'],
    ] as const;
    cases.forEach(([type, label]) => {
      const { unmount } = render(<EnergyTypeBadge type={type} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    });
  });

  it('applies type-specific colour classes', () => {
    const { container } = render(<EnergyTypeBadge type="diesel" />);
    expect(container.firstElementChild?.className).toMatch(/bg-amber-100/);
  });

  it('switches padding/size classes between sm and md', () => {
    const { container, rerender } = render(<EnergyTypeBadge type="e5" size="sm" />);
    expect(container.firstElementChild?.className).toMatch(/text-\[10px\]/);
    rerender(<EnergyTypeBadge type="e5" size="md" />);
    expect(container.firstElementChild?.className).toMatch(/text-xs/);
  });

  it('forwards a custom className', () => {
    const { container } = render(<EnergyTypeBadge type="e10" className="custom-cls" />);
    expect(container.firstElementChild?.className).toMatch(/custom-cls/);
  });
});
