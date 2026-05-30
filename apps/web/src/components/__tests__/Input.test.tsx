// @vitest-environment jsdom

// ============================================================
// Input — themed text input with label, hint, error, adornments.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import { Input } from '../ui/Input';

afterEach(() => cleanup());

describe('Input', () => {
  it('renders a text input', () => {
    render(<Input placeholder="email" />);
    expect(screen.getByPlaceholderText('email')).toBeInTheDocument();
  });

  it('associates the label with the input via a generated id', () => {
    render(<Input label="Email address" />);
    // getByLabelText resolves the htmlFor↔id wiring; succeeds only if linked.
    expect(screen.getByLabelText('Email address')).toBeInstanceOf(HTMLInputElement);
  });

  it('uses an explicit id when provided', () => {
    render(<Input id="my-field" label="Name" />);
    expect(screen.getByLabelText('Name')).toHaveAttribute('id', 'my-field');
  });

  it('renders a hint and wires aria-describedby to it', () => {
    render(<Input label="Pwd" hint="At least 8 chars" />);
    const input = screen.getByLabelText('Pwd');
    const hint = screen.getByText('At least 8 chars');
    expect(input.getAttribute('aria-describedby')).toContain(hint.id);
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('renders an error with role="alert", sets aria-invalid, and hides the hint', () => {
    render(<Input label="Pwd" hint="hint text" error="Too short" />);
    const input = screen.getByLabelText('Pwd');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const err = screen.getByRole('alert');
    expect(err).toHaveTextContent('Too short');
    // hint paragraph is suppressed while an error is shown
    expect(screen.queryByText('hint text')).toBeNull();
  });

  it('renders leading and trailing adornments', () => {
    render(
      <Input
        label="Search"
        leadingIcon={<svg data-testid="lead" />}
        trailingIcon={<svg data-testid="trail" />}
      />,
    );
    expect(screen.getByTestId('lead')).toBeInTheDocument();
    expect(screen.getByTestId('trail')).toBeInTheDocument();
  });

  it('forwards className to the input and supports controlled value/onChange', () => {
    const onChange = vi.fn();
    render(<Input label="L" className="custom" value="hi" onChange={onChange} />);
    const input = screen.getByLabelText('L');
    expect(input.className).toMatch(/custom/);
    expect(input).toHaveValue('hi');
    fireEvent.change(input, { target: { value: 'ho' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('forwards a ref to the input element', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} label="L" />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });
});
