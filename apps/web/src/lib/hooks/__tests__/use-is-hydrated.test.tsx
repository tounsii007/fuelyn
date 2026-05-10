// @vitest-environment jsdom

// ============================================================
// useIsHydrated — canonical mount-gate hook tests.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { useIsHydrated } from '../use-is-hydrated';

function Probe({ onSnapshot }: { onSnapshot: (v: boolean) => void }) {
  const v = useIsHydrated();
  onSnapshot(v);
  return <span data-testid="probe">{v ? 'mounted' : 'pending'}</span>;
}

describe('useIsHydrated', () => {
  afterEach(() => cleanup());

  it('returns false during SSR', () => {
    const html = renderToString(<Probe onSnapshot={() => {}} />);
    // SSR HTML must reflect the pre-mount state ('pending')
    expect(html).toContain('pending');
    expect(html).not.toContain('mounted');
  });

  it('returns true after the mount effect fires on the client', () => {
    const snapshots: boolean[] = [];
    render(<Probe onSnapshot={(v) => snapshots.push(v)} />);

    // Testing Library flushes effects, so the LAST snapshot reflects
    // the post-mount state. The first snapshot is the pre-mount one
    // (matches SSR), proving the hook produces a deterministic
    // SSR-safe initial value.
    expect(snapshots[0]).toBe(false);
    expect(snapshots[snapshots.length - 1]).toBe(true);
  });
});
