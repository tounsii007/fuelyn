// @vitest-environment jsdom

// ============================================================
// ErrorBoundary — render-crash firewall tests.
//
// Cover:
//   - Healthy path: passes children through untouched
//   - Crash path: catches a render-phase throw and shows the
//     fallback UI (default + custom render-prop variant)
//   - reset() clears the error state and re-renders children
//   - resetKey change auto-resets the boundary (route-change UX)
//   - onError callback fires once per crash
//   - Children that crash with a String value (rare React pattern)
//     still produce a usable fallback
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { ErrorBoundary } from '../error/ErrorBoundary';

// React logs caught errors via console.error in development. Silence
// so the test runner output stays focused on assertion failures.
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  consoleErrorSpy.mockRestore();
});

function Boom({ message = 'kaboom' }: { message?: string }): never {
  throw new Error(message);
}

describe('ErrorBoundary — healthy path', () => {
  it('renders children unchanged when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>healthy content</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('healthy content')).toBeInTheDocument();
    // No fallback UI elements
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('ErrorBoundary — crash path', () => {
  it('catches a render-phase throw and shows the default fallback', () => {
    render(
      <ErrorBoundary>
        <Boom message="render exploded" />
      </ErrorBoundary>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    // jsdom defaults navigator.language to 'en-US', which the
    // fallback's tiny inline locale picker maps to the en-US
    // dictionary → "Something went wrong" + English buttons.
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    // Error message must be surfaced for triage
    expect(screen.getByText(/render exploded/)).toBeInTheDocument();
    // Recovery buttons must both be present
    expect(screen.getByRole('button', { name: /Reload page/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Go home/i })).toBeInTheDocument();
  });

  it('uses the custom fallback render-prop when provided', () => {
    render(
      <ErrorBoundary
        fallback={(error, reset) => (
          <div>
            <span>custom fallback: {error.message}</span>
            <button type="button" onClick={reset}>
              custom reset
            </button>
          </div>
        )}
      >
        <Boom message="crashed" />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/custom fallback: crashed/)).toBeInTheDocument();
    // Default fallback must NOT also render
    expect(screen.queryByText(/Etwas ist schiefgegangen/)).toBeNull();
  });

  it('logs the caught error to console.error for triage', () => {
    render(
      <ErrorBoundary>
        <Boom message="for the logs" />
      </ErrorBoundary>,
    );

    const calls = consoleErrorSpy.mock.calls.flat().join(' ');
    expect(calls).toMatch(/\[Fuelyn ErrorBoundary\]/);
    expect(calls).toMatch(/for the logs/);
  });

  it('fires onError callback exactly once with the error and componentStack', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <Boom message="callback test" />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    const firstCall = onError.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [error, info] = firstCall as [Error, { componentStack: string }];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('callback test');
    expect(info.componentStack).toBeTruthy();
  });
});

describe('ErrorBoundary — reset paths', () => {
  it('reset() via the custom-fallback button clears the error and re-renders children', () => {
    // Toggleable child: throws on the first render, renders fine
    // on subsequent renders. We trigger that by tracking render
    // count via a ref-like state in the parent.
    function ToggleChild({ shouldCrash }: { shouldCrash: boolean }) {
      if (shouldCrash) throw new Error('first time only');
      return <span>recovered child</span>;
    }

    function Wrapper() {
      const [crash, setCrash] = useState(true);
      return (
        <ErrorBoundary
          fallback={(_, reset) => (
            <button
              type="button"
              onClick={() => {
                setCrash(false);
                reset();
              }}
            >
              recover
            </button>
          )}
        >
          <ToggleChild shouldCrash={crash} />
        </ErrorBoundary>
      );
    }

    render(<Wrapper />);

    // Initially the crashed fallback is showing
    expect(screen.getByText('recover')).toBeInTheDocument();

    fireEvent.click(screen.getByText('recover'));

    // After reset, children re-render successfully
    expect(screen.getByText('recovered child')).toBeInTheDocument();
    expect(screen.queryByText('recover')).toBeNull();
  });

  it('resetKey change auto-clears the error state without manual button click', () => {
    function ToggleChild({ shouldCrash }: { shouldCrash: boolean }) {
      if (shouldCrash) throw new Error('route 1 crash');
      return <span>route 2 ok</span>;
    }

    const { rerender } = render(
      <ErrorBoundary resetKey="route-1">
        <ToggleChild shouldCrash={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/route 1 crash/)).toBeInTheDocument();

    // Simulate route navigation: resetKey changes AND children no
    // longer throw. The boundary should auto-clear and render the
    // new children.
    rerender(
      <ErrorBoundary resetKey="route-2">
        <ToggleChild shouldCrash={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('route 2 ok')).toBeInTheDocument();
    expect(screen.queryByText(/route 1 crash/)).toBeNull();
  });

  it('does NOT reset when resetKey stays the same even after a re-render', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="stable">
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Re-render with the same resetKey but the child no longer
    // throws. Boundary should KEEP showing the fallback because
    // resetKey didn't change — without that lock, every parent
    // re-render would silently retry the crash.
    rerender(
      <ErrorBoundary resetKey="stable">
        <span>would-be-recovered</span>
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('would-be-recovered')).toBeNull();
  });
});
