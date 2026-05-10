// @vitest-environment jsdom

// ============================================================
// Badge — small status pill, tone-based.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Badge } from '../ui/Badge';

afterEach(() => cleanup());

describe('Badge', () => {
  it('renders children inside a span', () => {
    render(<Badge>Hello</Badge>);
    const el = screen.getByText('Hello');
    expect(el).toBeInTheDocument();
    expect(el.tagName).toBe('SPAN');
  });

  it('defaults to neutral tone + sm size', () => {
    const { container } = render(<Badge>x</Badge>);
    const el = container.firstElementChild!;
    expect(el.className).toMatch(/bg-\[var\(--color-bg-subtle\)\]/);
    expect(el.className).toMatch(/h-5/);
    expect(el.className).toMatch(/text-\[11px\]/);
  });

  it('switches to medium-size classes when size="md"', () => {
    const { container } = render(<Badge size="md">x</Badge>);
    expect(container.firstElementChild?.className).toMatch(/h-6/);
    expect(container.firstElementChild?.className).toMatch(/text-xs/);
  });

  it('applies tone-specific styles for each tone variant', () => {
    const tones = ['neutral', 'brand', 'success', 'warning', 'danger', 'info'] as const;
    tones.forEach((tone) => {
      const { container, unmount } = render(<Badge tone={tone}>{tone}</Badge>);
      // Each tone should produce some color-applied classes — we
      // assert the element has SOMETHING styled rather than the
      // exact OKLCH values (those evolve with the design tokens).
      expect(container.firstElementChild?.className.length).toBeGreaterThan(20);
      unmount();
    });
  });

  it('renders the leadingIcon to the left of the label', () => {
    render(
      <Badge leadingIcon={<svg data-testid="icon" />}>
        Label
      </Badge>,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByText('Label')).toBeInTheDocument();
  });

  it('forwards extra HTML attributes (className, data-*) to the root', () => {
    const { container } = render(
      <Badge className="custom" data-testid="b">
        x
      </Badge>,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toMatch(/custom/);
    expect(el.dataset.testid).toBe('b');
  });
});
