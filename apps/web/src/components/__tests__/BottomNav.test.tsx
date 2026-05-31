// @vitest-environment jsdom

// ============================================================
// BottomNav — mobile floating tab bar. Active tab is derived from
// usePathname(); the favourites tab carries a store-driven badge.
// next/link + next/navigation are stubbed (router-free in tests).
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { FavoriteStation } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';

const { pathnameMock } = vi.hoisted(() => ({ pathnameMock: { value: '/' } }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock.value,
}));

vi.mock('next/link', () => ({
  default: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { BottomNav } from '../layout/BottomNav';

const fav = (stationId: string): FavoriteStation => ({
  stationId,
  name: `Station ${stationId}`,
  brand: 'Aral',
  addedAt: '2026-01-01T00:00:00.000Z',
});

describe('BottomNav', () => {
  beforeEach(() => {
    pathnameMock.value = '/';
    useAppStore.setState({ favorites: [] });
  });
  afterEach(() => cleanup());

  it('renders the navigation landmark with all five tabs', () => {
    render(<BottomNav />);
    expect(screen.getByRole('navigation', { name: 'Hauptnavigation' })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(5);
  });

  it('marks the tab matching the current path as current', () => {
    pathnameMock.value = '/compare';
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: 'nav.compareTitle' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'nav.mapTitle' })).not.toHaveAttribute('aria-current');
  });

  it('shows a favourites badge with the saved count', () => {
    useAppStore.setState({ favorites: [fav('a'), fav('b'), fav('c')] });
    render(<BottomNav />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByLabelText('3 Einträge')).toBeInTheDocument();
  });

  it('caps the badge at "9+" beyond nine favourites', () => {
    useAppStore.setState({ favorites: Array.from({ length: 12 }, (_, i) => fav(String(i))) });
    render(<BottomNav />);
    expect(screen.getByText('9+')).toBeInTheDocument();
    expect(screen.getByLabelText('12 Einträge')).toBeInTheDocument();
  });

  it('hides the badge when there are no favourites', () => {
    render(<BottomNav />);
    expect(screen.queryByLabelText(/Eintr/)).toBeNull();
  });
});
