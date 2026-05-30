// @vitest-environment jsdom

// ============================================================
// Card — themed surface container with padding/elevation/interactive.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import { Card } from '../ui/Card';

afterEach(() => cleanup());

describe('Card', () => {
  it('renders children inside a div', () => {
    render(<Card>content</Card>);
    const el = screen.getByText('content');
    expect(el).toBeInTheDocument();
    expect(el.tagName).toBe('DIV');
  });

  it('applies the default md padding + raised elevation', () => {
    const { container } = render(<Card>x</Card>);
    const el = container.firstElementChild!;
    expect(el.className).toMatch(/\bp-4\b/);
    expect(el.className).toMatch(/shadow-\[var\(--shadow-md\)\]/);
  });

  it('applies padding variants', () => {
    const cases: Array<['none' | 'sm' | 'md' | 'lg', RegExp | null]> = [
      ['none', null],
      ['sm', /\bp-3\b/],
      ['md', /\bp-4\b/],
      ['lg', /\bp-6\b/],
    ];
    cases.forEach(([padding, re]) => {
      const { container, unmount } = render(<Card padding={padding}>x</Card>);
      const cls = container.firstElementChild!.className;
      if (re) expect(cls).toMatch(re);
      else expect(cls).not.toMatch(/\bp-\d\b/);
      unmount();
    });
  });

  it('applies elevation variants', () => {
    const cases: Array<['flat' | 'raised' | 'overlay', RegExp]> = [
      ['flat', /shadow-none/],
      ['raised', /shadow-\[var\(--shadow-md\)\]/],
      ['overlay', /shadow-\[var\(--shadow-xl\)\]/],
    ];
    cases.forEach(([elevation, re]) => {
      const { container, unmount } = render(<Card elevation={elevation}>x</Card>);
      expect(container.firstElementChild!.className).toMatch(re);
      unmount();
    });
  });

  it('adds interactive affordance classes only when interactive', () => {
    const { container, rerender } = render(<Card>x</Card>);
    expect(container.firstElementChild!.className).not.toMatch(/cursor-pointer/);
    rerender(<Card interactive>x</Card>);
    expect(container.firstElementChild!.className).toMatch(/cursor-pointer/);
  });

  it('forwards className, data-* and an onClick handler', () => {
    const onClick = vi.fn();
    render(
      <Card className="custom" data-testid="card" onClick={onClick}>
        x
      </Card>,
    );
    const el = screen.getByTestId('card');
    expect(el.className).toMatch(/custom/);
    fireEvent.click(el);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('forwards a ref to the div element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Card ref={ref}>x</Card>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
