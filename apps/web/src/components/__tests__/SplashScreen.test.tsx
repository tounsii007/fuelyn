// @vitest-environment jsdom

// ============================================================
// SplashScreen — animated intro. Drives a timed phase machine
// (enter → active → exit → done) off setTimeout, then calls
// onComplete and unmounts. Timers are faked to advance the run.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { SplashScreen } from '../splash/SplashScreen';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SplashScreen', () => {
  it('renders the brand wordmark and tagline', () => {
    const { container } = render(<SplashScreen onComplete={vi.fn()} />);
    expect(container.textContent).toContain('Fuelyn');
    expect(screen.getByText('AI fuel intelligence')).toBeInTheDocument();
    expect(screen.getByText('Echtzeit-Preise')).toBeInTheDocument();
  });

  it('calls onComplete after the splash sequence finishes', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(<SplashScreen onComplete={onComplete} />);
    expect(onComplete).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('unmounts its content once the sequence is done', () => {
    vi.useFakeTimers();
    const { container } = render(<SplashScreen onComplete={vi.fn()} />);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(container.firstChild).toBeNull();
  });
});
