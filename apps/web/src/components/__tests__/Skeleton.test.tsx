// @vitest-environment jsdom

// ============================================================
// Skeleton — shimmer loading placeholder + StationCardSkeleton.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Skeleton, StationCardSkeleton } from '../ui/Skeleton';

afterEach(() => cleanup());

describe('Skeleton', () => {
  it('renders a status element labelled "Loading" with the shimmer class', () => {
    render(<Skeleton />);
    const el = screen.getByRole('status');
    expect(el).toHaveAttribute('aria-label', 'Loading');
    expect(el.className).toMatch(/fy-shimmer/);
    expect(el.className).toMatch(/rounded-lg/);
  });

  it('appends a custom className while keeping the shimmer base', () => {
    render(<Skeleton className="h-9 w-9" />);
    const el = screen.getByRole('status');
    expect(el.className).toMatch(/fy-shimmer/);
    expect(el.className).toMatch(/h-9/);
    expect(el.className).toMatch(/w-9/);
  });
});

describe('StationCardSkeleton', () => {
  it('composes multiple shimmer skeletons', () => {
    render(<StationCardSkeleton />);
    // The composite is built from several Skeleton blocks.
    expect(screen.getAllByRole('status').length).toBeGreaterThan(1);
  });
});
