// @vitest-environment jsdom

// ============================================================
// EmptyState — placeholder for empty/error states.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { EmptyState } from '../ui/EmptyState';

afterEach(() => cleanup());

describe('EmptyState', () => {
  it('renders title and string message', () => {
    render(<EmptyState title="Nothing here" message="Try a wider radius." />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByText('Try a wider radius.')).toBeInTheDocument();
  });

  it('renders the default fuel-pump icon when none is provided', () => {
    const { container } = render(<EmptyState title="t" message="m" />);
    const icon = container.querySelector('[role="img"]');
    expect(icon?.textContent).toBe('⛽');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('uses the custom icon when provided', () => {
    const { container } = render(<EmptyState icon="🔍" title="t" message="m" />);
    const icon = container.querySelector('[role="img"]');
    expect(icon?.textContent).toBe('🔍');
  });

  it('does NOT render an action button when action prop is omitted', () => {
    render(<EmptyState title="t" message="m" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders an action button and fires onClick when action is provided', () => {
    const handler = vi.fn();
    render(
      <EmptyState
        title="t"
        message="m"
        action={{ label: 'Retry', onClick: handler }}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('accepts a ReactNode as message (renders nested elements)', () => {
    render(
      <EmptyState
        title="t"
        message={
          <span>
            line 1<br />
            <strong>line 2</strong>
          </span>
        }
      />,
    );
    expect(screen.getByText('line 1')).toBeInTheDocument();
    expect(screen.getByText('line 2').tagName).toBe('STRONG');
  });

  it('exposes role="status" on the wrapper for assistive tech', () => {
    const { container } = render(<EmptyState title="t" message="m" />);
    expect(container.firstElementChild).toHaveAttribute('role', 'status');
  });
});
