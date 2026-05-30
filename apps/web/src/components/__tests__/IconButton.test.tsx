// @vitest-environment jsdom

// ============================================================
// IconButton — square, icon-only button. Requires an aria-label
// because there's no visible text.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import { IconButton } from '../ui/IconButton';

afterEach(() => cleanup());

describe('IconButton', () => {
  it('renders its child icon and exposes the aria-label', () => {
    render(
      <IconButton aria-label="Close">
        <svg data-testid="icon" />
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('defaults to type="button"', () => {
    render(
      <IconButton aria-label="x">
        <svg />
      </IconButton>,
    );
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('defaults to the neutral tone', () => {
    render(
      <IconButton aria-label="x">
        <svg />
      </IconButton>,
    );
    expect(screen.getByRole('button').className).toMatch(/text-gray-500/);
  });

  it('applies tone-specific classes', () => {
    const cases: Array<['neutral' | 'danger' | 'brand', RegExp]> = [
      ['neutral', /text-gray-500/],
      ['danger', /text-red-500/],
      ['brand', /text-brand-600/],
    ];
    cases.forEach(([tone, re]) => {
      const { unmount } = render(
        <IconButton aria-label="x" tone={tone}>
          <svg />
        </IconButton>,
      );
      expect(screen.getByRole('button').className).toMatch(re);
      unmount();
    });
  });

  it('applies size-specific classes (sm default, md opt-in)', () => {
    const { rerender } = render(
      <IconButton aria-label="x">
        <svg />
      </IconButton>,
    );
    expect(screen.getByRole('button').className).toMatch(/h-8 w-8/);
    rerender(
      <IconButton aria-label="x" size="md">
        <svg />
      </IconButton>,
    );
    expect(screen.getByRole('button').className).toMatch(/h-10 w-10/);
  });

  it('fires onClick when clicked', () => {
    const onClick = vi.fn();
    render(
      <IconButton aria-label="x" onClick={onClick}>
        <svg />
      </IconButton>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', () => {
    const onClick = vi.fn();
    render(
      <IconButton aria-label="x" disabled onClick={onClick}>
        <svg />
      </IconButton>,
    );
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('forwards className and arbitrary attributes', () => {
    render(
      <IconButton aria-label="x" className="custom" data-testid="ib">
        <svg />
      </IconButton>,
    );
    const btn = screen.getByTestId('ib');
    expect(btn.className).toMatch(/custom/);
  });

  it('forwards a ref to the button element', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <IconButton aria-label="x" ref={ref}>
        <svg />
      </IconButton>,
    );
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
