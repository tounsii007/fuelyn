// @vitest-environment jsdom

// ============================================================
// MembershipPicker — toggleable list of brand loyalty cards from
// the core MEMBERSHIPS taxonomy, backed by the Zustand store's
// activeMemberships set. Hydration-gated, so RTL's effect flush
// reveals it.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MEMBERSHIPS } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { MembershipPicker } from '../settings/MembershipPicker';

describe('MembershipPicker', () => {
  beforeEach(() => {
    useAppStore.setState({ activeMemberships: [] });
  });
  afterEach(() => cleanup());

  it('renders a labelled section with one checkbox per membership', () => {
    render(<MembershipPicker />);
    expect(screen.getByRole('region', { name: 'memberships.title' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(MEMBERSHIPS.length);
  });

  it('toggles a membership through the store action', () => {
    const first = MEMBERSHIPS[0];
    expect(first).toBeDefined();
    render(<MembershipPicker />);
    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    expect(useAppStore.getState().activeMemberships).toContain(first!.id);
  });

  it('reflects an already-active membership as checked', () => {
    useAppStore.setState({ activeMemberships: [MEMBERSHIPS[0]!.id] });
    render(<MembershipPicker />);
    expect(screen.getAllByRole('checkbox')[0]).toBeChecked();
  });
});
