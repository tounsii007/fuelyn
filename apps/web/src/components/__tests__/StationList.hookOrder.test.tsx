// @vitest-environment jsdom

// ============================================================
// StationList — Rules-of-Hooks regression tests for commit
// 913e8e1 ("StationList — fix conditional-hook bug crashing
// the homepage").
//
// The bug: useAppStore + useMemo were called BELOW the
// isLoading / isError / empty early-returns. A render that
// hit any early return called 5 hooks; a render that didn't
// called 7. React 19 production bailed the whole tree out
// with #310 ("Rendered more hooks than during the previous
// render") + #418 (cascading hydration mismatch on parent).
//
// These tests pin the fix in three ways:
//   1. The component renders cleanly across every branch.
//   2. The loading→loaded transition (the exact path that
//      tripped the bug — Homepage mounts <StationList
//      isLoading={true}/> first, then re-renders with
//      isLoading=false once React Query resolves) does NOT
//      throw and emits no console.error.
//   3. A static-analysis assertion that the source file
//      doesn't have hooks below an early return — guards
//      against re-introducing the same shape later.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import type { StationRecommendation } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';
import { StationList } from '../stations/StationList';

// Stub the heavy StationCard so the test stays focused on the
// list's hook-order behaviour rather than card internals.
vi.mock('../stations/StationCard', () => ({
  StationCard: ({ recommendation }: { recommendation: StationRecommendation }) => (
    <div data-testid="station-card" data-id={recommendation.station.id}>
      {recommendation.station.brand}
    </div>
  ),
}));

vi.mock('../ui/Skeleton', () => ({
  StationCardSkeleton: () => <div data-testid="skeleton" />,
}));

function makeRecommendation(
  id: string,
  brand: string,
  price: number,
): StationRecommendation {
  return {
    station: {
      id,
      name: `${brand} Test`,
      brand,
      street: 'Teststraße',
      houseNumber: '1',
      postCode: '35037',
      place: 'Marburg',
      lat: 50.8,
      lng: 8.77,
      dist: 1.0,
      prices: { diesel: null, e5: null, e10: price },
      isOpen: true,
    },
    scores: {
      overall: 0.9,
      price: 0.9,
      distance: 0.9,
      reachability: 1.0,
      favorite: 0,
    },
    reachabilityStatus: 'safe',
    estimatedFuelCost: 0.1,
    estimatedDriveTime: 2,
    rank: 1,
    isBestOption: false,
    reasons: [],
  };
}

const SAMPLE = [
  makeRecommendation('s1', 'Aral',  1.799),
  makeRecommendation('s2', 'Esso',  1.819),
  makeRecommendation('s3', 'Shell', 1.789),
];

describe('StationList — Rules-of-Hooks regression (commit 913e8e1)', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Pin the fuel type so useAppStore returns a deterministic value
    // regardless of which previous test left it set.
    useAppStore.setState({
      filter: {
        fuelType: 'e10',
        radiusKm: 5,
        onlyOpen: false,
        brands: [],
        priceMin: null,
        priceMax: null,
      },
    });
    // Capture React's "Rendered more hooks" hard error so failures
    // don't get swallowed by jsdom's default error handling.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    consoleErrorSpy.mockRestore();
  });

  it('renders skeleton placeholders while isLoading', () => {
    render(
      <StationList
        recommendations={[]}
        isLoading={true}
        isError={false}
        onStationClick={() => {}}
      />,
    );
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('station-card')).toBeNull();
  });

  it('renders the error EmptyState when isError is true', () => {
    render(
      <StationList
        recommendations={[]}
        isLoading={false}
        isError={true}
        onStationClick={() => {}}
        onRetry={() => {}}
      />,
    );
    expect(
      screen.getByText(/Daten konnten nicht geladen werden/i),
    ).toBeInTheDocument();
  });

  it('renders the empty-state tip when recommendations is empty', () => {
    render(
      <StationList
        recommendations={[]}
        isLoading={false}
        isError={false}
        onStationClick={() => {}}
      />,
    );
    expect(screen.getByText(/Keine Tankstellen gefunden/i)).toBeInTheDocument();
  });

  it('renders the cards on the success branch', () => {
    render(
      <StationList
        recommendations={SAMPLE}
        isLoading={false}
        isError={false}
        onStationClick={() => {}}
      />,
    );
    const cards = screen.getAllByTestId('station-card');
    expect(cards).toHaveLength(SAMPLE.length);
    expect(cards.map((c) => c.dataset.id)).toEqual(['s1', 's2', 's3']);
  });

  // ─── THE bug-pinning test ────────────────────────────────────
  it('survives the loading → loaded re-render WITHOUT throwing', () => {
    // This is the exact transition that crashed the homepage:
    //   1st render:  isLoading=true,  recs=[]      → 5 hooks called,
    //                                                 early-return on
    //                                                 the loading branch
    //   2nd render:  isLoading=false, recs=SAMPLE  → 7 hooks called,
    //                                                 success branch
    //
    // Pre-fix: React threw error #310 on the second render because the
    // hook count grew from 5 → 7. With the fix, all 7 hooks are called
    // up-front in BOTH renders, so the count is stable and the rerender
    // is a clean state transition.
    const { rerender } = render(
      <StationList
        recommendations={[]}
        isLoading={true}
        isError={false}
        onStationClick={() => {}}
      />,
    );

    // Re-render with the loaded data — this is the path that exposed
    // the bug.
    rerender(
      <StationList
        recommendations={SAMPLE}
        isLoading={false}
        isError={false}
        onStationClick={() => {}}
      />,
    );

    // The loaded cards must now be in the DOM…
    expect(screen.getAllByTestId('station-card')).toHaveLength(SAMPLE.length);

    // …and React must not have logged a hook-order violation. Any
    // console.error containing #310 / "Rendered more hooks" / "Rules
    // of Hooks" would indicate a regression.
    const errorMessages = consoleErrorSpy.mock.calls
      .map((args) => args.join(' '))
      .join('\n');
    expect(errorMessages).not.toMatch(/Rendered more hooks/i);
    expect(errorMessages).not.toMatch(/Rules of Hooks/i);
    expect(errorMessages).not.toMatch(/error #310/i);
  });

  it('also survives error → loaded and empty → loaded transitions', () => {
    // Both other early-return branches must be safe to leave too,
    // not just the loading branch tested above.
    const { rerender } = render(
      <StationList
        recommendations={[]}
        isLoading={false}
        isError={true}
        onStationClick={() => {}}
        onRetry={() => {}}
      />,
    );
    rerender(
      <StationList
        recommendations={SAMPLE}
        isLoading={false}
        isError={false}
        onStationClick={() => {}}
      />,
    );
    expect(screen.getAllByTestId('station-card')).toHaveLength(SAMPLE.length);

    rerender(
      <StationList
        recommendations={[]}
        isLoading={false}
        isError={false}
        onStationClick={() => {}}
      />,
    );
    rerender(
      <StationList
        recommendations={SAMPLE}
        isLoading={false}
        isError={false}
        onStationClick={() => {}}
      />,
    );
    expect(screen.getAllByTestId('station-card')).toHaveLength(SAMPLE.length);

    const errorMessages = consoleErrorSpy.mock.calls
      .map((args) => args.join(' '))
      .join('\n');
    expect(errorMessages).not.toMatch(/Rendered more hooks/i);
  });
});

// ─── Static-analysis guard ────────────────────────────────────
// The runtime tests above prove the current shape is correct, but
// we also want a guard that catches the regression at edit time
// rather than only when someone runs the test suite. Robust AST
// parsing of TSX is out of scope for a test, so instead we rely
// on a structural shape: in the fixed file, the LAST hook call
// in the component body ALWAYS appears before the FIRST early
// `if (...) {\n      return` guard.
//
// We extract the function body via line-based parsing (skipping
// comments and string contents to avoid false positives that the
// previous brace-counting attempt suffered from), then assert the
// invariant.
describe('StationList — source-level guard against hooks below early returns', () => {
  it('every hook call in the component body precedes the first `if (...) { return` guard', () => {
    const sourcePath = path.resolve(
      __dirname,
      '..',
      'stations',
      'StationList.tsx',
    );
    const source = readFileSync(sourcePath, 'utf8');

    const startMarker = 'export function StationList(';
    const startIdx = source.indexOf(startMarker);
    expect(startIdx).toBeGreaterThan(-1);
    const tailIdx = source.indexOf('// ─── Helpers', startIdx);
    const body = source.slice(startIdx, tailIdx === -1 ? undefined : tailIdx);

    // Strip line comments so a `// ... return ...` doesn't confuse
    // the search. (Block comments and strings would also need to be
    // stripped for a fully-sound parser, but the file uses neither
    // in patterns that would matter here.)
    const stripped = body.replace(/\/\/[^\n]*/g, '');
    const lines = stripped.split('\n');

    // Find indices of (a) hook call lines and (b) early-return
    // guard lines. We anchor on the canonical 2-space indent of
    // top-level statements inside a function body.
    let firstEarlyReturnLine = -1;
    const hookCallLines: number[] = [];

    for (let n = 0; n < lines.length; n++) {
      const line = lines[n];
      // Match `  if (...) {` exactly at 2 spaces of indent.
      if (firstEarlyReturnLine === -1 && /^ {2}if \(/.test(line)) {
        // Look ahead for `    return` at 4 spaces — confirms it's a
        // guard, not a normal control-flow if.
        for (let m = n + 1; m < Math.min(lines.length, n + 4); m++) {
          if (/^ {4}return\b/.test(lines[m])) {
            firstEarlyReturnLine = n;
            break;
          }
        }
      }
      // Match `  const ... = useFoo(` at 2-space indent.
      if (/^ {2}const\b.*\buse[A-Z]\w*\(/.test(line) || /^ {2}use[A-Z]\w*\(/.test(line)) {
        hookCallLines.push(n);
      }
    }

    expect(firstEarlyReturnLine).toBeGreaterThan(-1);
    expect(hookCallLines.length).toBeGreaterThan(0);

    const offending = hookCallLines.filter((n) => n > firstEarlyReturnLine);

    if (offending.length > 0) {
      const preview = offending.map((n) => `L${n + 1}: ${lines[n].trim()}`).join('\n  ');
      throw new Error(
        `StationList has ${offending.length} top-level hook call(s) AFTER the first ` +
          `early-return guard at line ~${firstEarlyReturnLine + 1} — this is the ` +
          `conditional-hook bug fixed in 913e8e1. Move them above the early returns.` +
          `\n\nOffending lines:\n  ${preview}`,
      );
    }
  });
});
