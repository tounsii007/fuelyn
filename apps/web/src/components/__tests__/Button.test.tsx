// @vitest-environment jsdom

// ============================================================
// Button — polymorphic themed button with variants, sizes,
// loading state, and leading/trailing icons.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import { Button } from '../ui/Button';

afterEach(() => cleanup());

describe('Button', () => {
  it('renders its children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('defaults to type="button" (so it never submits a form by accident)', () => {
    render(<Button>x</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('honours an explicit type override', () => {
    render(<Button type="submit">x</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('applies the default primary + md variant classes', () => {
    render(<Button>x</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toMatch(/var\(--color-brand-600\)/);
    expect(btn.className).toMatch(/h-10/);
  });

  it('applies variant-specific classes', () => {
    const cases: Array<[Parameters<typeof Button>[0]['variant'], RegExp]> = [
      ['secondary', /var\(--color-surface\)/],
      ['ghost', /bg-transparent/],
      ['outline', /var\(--color-brand-500\)/],
      ['danger', /var\(--color-danger-500\)/],
    ];
    cases.forEach(([variant, re]) => {
      const { unmount } = render(<Button variant={variant}>x</Button>);
      expect(screen.getByRole('button').className).toMatch(re);
      unmount();
    });
  });

  it('applies size-specific classes', () => {
    const cases: Array<['sm' | 'md' | 'lg', RegExp]> = [
      ['sm', /h-8/],
      ['md', /h-10/],
      ['lg', /h-12/],
    ];
    cases.forEach(([size, re]) => {
      const { unmount } = render(<Button size={size}>x</Button>);
      expect(screen.getByRole('button').className).toMatch(re);
      unmount();
    });
  });

  it('adds w-full only when fullWidth is set', () => {
    const { rerender } = render(<Button>x</Button>);
    expect(screen.getByRole('button').className).not.toMatch(/\bw-full\b/);
    rerender(<Button fullWidth>x</Button>);
    expect(screen.getByRole('button').className).toMatch(/\bw-full\b/);
  });

  it('fires onClick when enabled', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>x</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled and does not fire onClick when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        x
      </Button>,
    );
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders a spinner, sets aria-busy, and disables the button while loading', () => {
    const onClick = vi.fn();
    const { container } = render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    );
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toBeDisabled();
    expect(container.querySelector('svg.animate-spin')).not.toBeNull();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not set aria-busy when not loading', () => {
    render(<Button>x</Button>);
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-busy');
  });

  it('renders leading and trailing icons when not loading', () => {
    render(
      <Button
        leadingIcon={<svg data-testid="lead" />}
        trailingIcon={<svg data-testid="trail" />}
      >
        x
      </Button>,
    );
    expect(screen.getByTestId('lead')).toBeInTheDocument();
    expect(screen.getByTestId('trail')).toBeInTheDocument();
  });

  it('hides leading/trailing icons while loading (spinner replaces them)', () => {
    render(
      <Button loading leadingIcon={<svg data-testid="lead" />}>
        x
      </Button>,
    );
    expect(screen.queryByTestId('lead')).toBeNull();
  });

  it('forwards className and arbitrary attributes to the button', () => {
    render(
      <Button className="custom" data-testid="b" aria-label="save">
        x
      </Button>,
    );
    const btn = screen.getByTestId('b');
    expect(btn.className).toMatch(/custom/);
    expect(btn).toHaveAttribute('aria-label', 'save');
  });

  it('forwards a ref to the underlying button element', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>x</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
