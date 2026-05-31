// @vitest-environment jsdom

// ============================================================
// Select — themed <select> with label, hint, error + a11y wiring.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import { Select } from '../ui/Select';

afterEach(() => cleanup());

describe('Select', () => {
  it('renders a labelled <select> with its options', () => {
    render(
      <Select label="Stadt" defaultValue="b">
        <option value="a">A-Stadt</option>
        <option value="b">B-Stadt</option>
      </Select>,
    );
    const select = screen.getByLabelText('Stadt');
    expect(select.tagName.toLowerCase()).toBe('select');
    expect(screen.getByRole('option', { name: 'A-Stadt' })).toBeInTheDocument();
  });

  it('wires the label to the select via a generated id', () => {
    render(
      <Select label="Land">
        <option value="de">DE</option>
      </Select>,
    );
    // getByLabelText only resolves when htmlFor↔id are correctly linked.
    expect(screen.getByLabelText('Land')).toBeInTheDocument();
  });

  it('honours an explicit id', () => {
    render(
      <Select label="Land" id="country-select">
        <option value="de">DE</option>
      </Select>,
    );
    expect(screen.getByLabelText('Land')).toHaveAttribute('id', 'country-select');
  });

  it('renders a hint and points aria-describedby at it', () => {
    render(
      <Select label="Land" hint="Bitte wählen">
        <option value="de">DE</option>
      </Select>,
    );
    const select = screen.getByLabelText('Land');
    const hint = screen.getByText('Bitte wählen');
    const describedby = select.getAttribute('aria-describedby');
    expect(describedby).toBeTruthy();
    expect(describedby).toBe(hint.id);
    expect(select).not.toHaveAttribute('aria-invalid');
  });

  it('renders an error (role=alert), sets aria-invalid, and hides the hint', () => {
    render(
      <Select label="Land" hint="Bitte wählen" error="Pflichtfeld">
        <option value="de">DE</option>
      </Select>,
    );
    const select = screen.getByLabelText('Land');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Pflichtfeld');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select.getAttribute('aria-describedby')).toContain(alert.id);
    // The hint paragraph must give way to the error message.
    expect(screen.queryByText('Bitte wählen')).toBeNull();
  });

  it('forwards className and arbitrary props to the <select>', () => {
    const onChange = vi.fn();
    render(
      <Select label="Land" className="custom-cls" data-testid="sel" onChange={onChange} value="de">
        <option value="de">DE</option>
        <option value="fr">FR</option>
      </Select>,
    );
    const select = screen.getByTestId('sel');
    expect(select.className).toMatch(/custom-cls/);
    fireEvent.change(select, { target: { value: 'fr' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('forwards a ref to the underlying <select>', () => {
    const ref = createRef<HTMLSelectElement>();
    render(
      <Select label="Land" ref={ref}>
        <option value="de">DE</option>
      </Select>,
    );
    expect(ref.current).toBeInstanceOf(HTMLSelectElement);
  });
});
