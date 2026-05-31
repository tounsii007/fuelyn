// @vitest-environment jsdom

// ============================================================
// ToggleSwitch — accessible role="switch" on/off control.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import { ToggleSwitch } from '../ui/ToggleSwitch';

afterEach(() => cleanup());

describe('ToggleSwitch', () => {
  it('exposes role="switch" with aria-checked reflecting state', () => {
    const { rerender } = render(
      <ToggleSwitch aria-label="Notifications" checked={false} onChange={() => {}} />,
    );
    const sw = screen.getByRole('switch', { name: 'Notifications' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    rerender(<ToggleSwitch aria-label="Notifications" checked onChange={() => {}} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onChange with the negated value when clicked', () => {
    const onChange = vi.fn();
    render(<ToggleSwitch aria-label="x" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('negates from true → false', () => {
    const onChange = vi.fn();
    render(<ToggleSwitch aria-label="x" checked onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('also invokes a passed-through onClick handler', () => {
    const onChange = vi.fn();
    const onClick = vi.fn();
    render(
      <ToggleSwitch aria-label="x" checked={false} onChange={onChange} onClick={onClick} />,
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not toggle when disabled', () => {
    const onChange = vi.fn();
    render(<ToggleSwitch aria-label="x" checked={false} onChange={onChange} disabled />);
    const sw = screen.getByRole('switch');
    expect(sw).toBeDisabled();
    fireEvent.click(sw);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies on/off track colour classes', () => {
    const { rerender } = render(
      <ToggleSwitch aria-label="x" checked={false} onChange={() => {}} />,
    );
    expect(screen.getByRole('switch').className).toMatch(/bg-gray-300/);
    rerender(<ToggleSwitch aria-label="x" checked onChange={() => {}} />);
    expect(screen.getByRole('switch').className).toMatch(/bg-brand-600/);
  });

  it('translates the thumb based on checked state', () => {
    const { container, rerender } = render(
      <ToggleSwitch aria-label="x" checked={false} onChange={() => {}} />,
    );
    const thumbOff = container.querySelector('span[aria-hidden="true"]');
    expect(thumbOff?.className).toMatch(/translate-x-0\.5/);
    rerender(<ToggleSwitch aria-label="x" checked onChange={() => {}} />);
    const thumbOn = container.querySelector('span[aria-hidden="true"]');
    expect(thumbOn?.className).toMatch(/translate-x-5/);
  });

  it('forwards className and a ref', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <ToggleSwitch
        aria-label="x"
        checked={false}
        onChange={() => {}}
        className="custom"
        ref={ref}
      />,
    );
    expect(screen.getByRole('switch').className).toMatch(/custom/);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
