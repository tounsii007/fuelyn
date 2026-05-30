// @vitest-environment jsdom

// ============================================================
// CompareTray — floating "X zum Vergleich" pill. Hidden when the
// compare set is empty or on /compare itself; otherwise shows a
// count + CTA + clear control. next/link + next/navigation stubbed.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useAppStore } from '@/lib/store/app-store';

const { pathnameMock } = vi.hoisted(() => ({ pathnameMock: { value: '/' } }));

vi.mock('next/navigation', () => ({ usePathname: () => pathnameMock.value }));
vi.mock('next/link', () => ({
  default: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));
vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { CompareTray } from '../stations/CompareTray';

describe('CompareTray', () => {
  beforeEach(() => {
    pathnameMock.value = '/';
    useAppStore.setState({ compareStationIds: [] });
  });
  afterEach(() => cleanup());

  it('renders nothing when the compare set is empty', () => {
    const { container } = render(<CompareTray />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing on the /compare route even with items queued', () => {
    pathnameMock.value = '/compare';
    useAppStore.setState({ compareStationIds: ['a', 'b'] });
    const { container } = render(<CompareTray />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the count pill and CTA when stations are queued', () => {
    useAppStore.setState({ compareStationIds: ['a', 'b'] });
    render(<CompareTray />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /compare\.cta/ })).toHaveAttribute('href', '/compare');
  });

  it('clears the set through the clear control', () => {
    useAppStore.setState({ compareStationIds: ['a', 'b'] });
    render(<CompareTray />);
    fireEvent.click(screen.getByRole('button', { name: 'compare.clearAll' }));
    expect(useAppStore.getState().compareStationIds).toHaveLength(0);
  });
});
