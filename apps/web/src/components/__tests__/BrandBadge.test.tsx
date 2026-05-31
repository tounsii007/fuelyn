// @vitest-environment jsdom

// ============================================================
// BrandBadge — gradient brand chip with initials from brand-config.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { BrandBadge } from '../ui/BrandBadge';

afterEach(() => cleanup());

describe('BrandBadge', () => {
  it('renders the configured initials and a title for a known brand', () => {
    render(<BrandBadge brand="Aral" />);
    const root = screen.getByTitle('Aral');
    expect(root).toBeInTheDocument();
    expect(root).toHaveTextContent('A');
  });

  it('falls back to the default pump glyph for an unknown/empty brand', () => {
    render(<BrandBadge brand="" />);
    expect(screen.getByText('⛽')).toBeInTheDocument();
  });

  it('applies size-specific box classes', () => {
    const cases: Array<['sm' | 'md' | 'lg', RegExp]> = [
      ['sm', /w-7 h-7/],
      ['md', /w-9 h-9/],
      ['lg', /w-11 h-11/],
    ];
    cases.forEach(([size, re]) => {
      const { unmount } = render(<BrandBadge brand="Shell" size={size} />);
      expect(screen.getByTitle('Shell').className).toMatch(re);
      unmount();
    });
  });

  it('forwards a custom className to the root', () => {
    render(<BrandBadge brand="Esso" className="custom-cls" />);
    expect(screen.getByTitle('Esso').className).toMatch(/custom-cls/);
  });
});
