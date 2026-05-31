// @vitest-environment jsdom

// ============================================================
// Toast — ToastProvider context + useToast() show/dismiss with
// auto-dismiss timers and tone-coded styling.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, renderHook } from '@testing-library/react';
import { ToastProvider, useToast, type ToastInput } from '../ui/Toast';

// Identity translation so the close-button aria-label is predictable.
vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

afterEach(() => cleanup());

// Button that fires toast.show with whatever input the test supplies.
function Trigger(props: Partial<ToastInput> = {}) {
  const toast = useToast();
  return (
    <button onClick={() => toast.show({ title: 'Gespeichert', ...props })}>
      show
    </button>
  );
}

function renderWithProvider(node: React.ReactNode) {
  return render(<ToastProvider>{node}</ToastProvider>);
}

describe('useToast', () => {
  it('throws when used outside a ToastProvider', () => {
    // Silence the expected React error log for the throwing render.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useToast())).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});

describe('Toast', () => {
  it('shows a toast (role=status) with title + description', () => {
    renderWithProvider(<Trigger description="Alle Details" />);
    expect(screen.queryByRole('status')).toBeNull();

    fireEvent.click(screen.getByText('show'));

    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Gespeichert');
    expect(toast).toHaveTextContent('Alle Details');
  });

  it('applies the tone-specific accent border (success)', () => {
    renderWithProvider(<Trigger tone="success" />);
    fireEvent.click(screen.getByText('show'));
    expect(screen.getByRole('status').className).toMatch(/--color-success-500/);
  });

  it('defaults to the info tone when none is given', () => {
    renderWithProvider(<Trigger />);
    fireEvent.click(screen.getByText('show'));
    expect(screen.getByRole('status').className).toMatch(/--color-info-500/);
  });

  it('dismisses a toast via the close button', () => {
    renderWithProvider(<Trigger />);
    fireEvent.click(screen.getByText('show'));
    expect(screen.getByRole('status')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'miscAria.notificationClose' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('auto-dismisses after durationMs', () => {
    vi.useFakeTimers();
    try {
      renderWithProvider(<Trigger durationMs={1000} />);
      act(() => {
        fireEvent.click(screen.getByText('show'));
      });
      expect(screen.getByRole('status')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.queryByRole('status')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stacks multiple toasts', () => {
    renderWithProvider(<Trigger />);
    fireEvent.click(screen.getByText('show'));
    fireEvent.click(screen.getByText('show'));
    expect(screen.getAllByRole('status')).toHaveLength(2);
  });
});
