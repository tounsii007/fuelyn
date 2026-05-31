// @vitest-environment jsdom

// ============================================================
// CountryFlag — inline SVG flags with an accessible label.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CountryFlag, type FlagCode } from '../ui/CountryFlag';

afterEach(() => cleanup());

describe('CountryFlag', () => {
  it('exposes role="img" and labels itself with the code by default', () => {
    render(<CountryFlag code="DE" />);
    const flag = screen.getByRole('img');
    expect(flag).toHaveAttribute('aria-label', 'DE');
    expect(flag.tagName.toLowerCase()).toBe('svg');
  });

  it('uses the title for the aria-label and renders an SVG <title>', () => {
    const { container } = render(<CountryFlag code="FR" title="Frankreich" />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Frankreich');
    expect(container.querySelector('title')?.textContent).toBe('Frankreich');
  });

  it('forwards className and arbitrary SVG props', () => {
    render(<CountryFlag code="IT" className="h-4 w-5" data-testid="flag" />);
    const flag = screen.getByTestId('flag');
    expect(flag.getAttribute('class')).toMatch(/h-4/);
  });

  it('renders every supported flag code without crashing', () => {
    const codes: readonly FlagCode[] = [
      'DE',
      'GB',
      'EN',
      'US',
      'AT',
      'CH',
      'FR',
      'IT',
      'NL',
      'PL',
    ];
    codes.forEach((code) => {
      const { container, unmount } = render(<CountryFlag code={code} />);
      // Each flag must paint at least one shape.
      expect(container.querySelector('rect, path, circle')).not.toBeNull();
      unmount();
    });
  });
});
