// @vitest-environment jsdom

// ============================================================
// Autocomplete — generic combobox with a filtered listbox,
// keyboard navigation and click-outside dismissal.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { Autocomplete } from '../ui/Autocomplete';

afterEach(() => cleanup());

const FRUITS = ['Apple', 'Apricot', 'Banana', 'Cherry'] as const;

// Controlled wrapper — Autocomplete's `value` is fully controlled, so a
// tiny harness owns the state the way real call-sites do.
function Harness({ onSelect }: { onSelect?: (item: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <Autocomplete<string>
      value={value}
      onChange={setValue}
      onSelect={(item) => {
        setValue(item);
        onSelect?.(item);
      }}
      search={(q) =>
        FRUITS.filter((f) => f.toLowerCase().includes(q.toLowerCase()))
      }
      renderItem={(item) => <span>{item}</span>}
      getItemKey={(item) => item}
      label="Frucht"
      id="fruit"
      placeholder="Suche…"
    />
  );
}

describe('Autocomplete', () => {
  it('renders a labelled combobox input', () => {
    render(<Harness />);
    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(screen.getByPlaceholderText('Suche…')).toBe(input);
    // label is wired to the input id
    expect(screen.getByLabelText('Frucht')).toBe(input);
  });

  it('opens a listbox of matches as you type', () => {
    render(<Harness />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'Ap' } });

    expect(input).toHaveAttribute('aria-expanded', 'true');
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Apple', 'Apricot']);
  });

  it('does not open when the query yields no matches', () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzz' } });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('selects an option on click and closes the dropdown', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Ap' } });

    fireEvent.click(screen.getByRole('option', { name: 'Apple' }));

    expect(onSelect).toHaveBeenCalledWith('Apple');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('combobox')).toHaveValue('Apple');
  });

  it('navigates with ArrowDown and selects with Enter', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'Ap' } });

    fireEvent.keyDown(input, { key: 'ArrowDown' }); // highlight idx 0
    expect(screen.getByRole('option', { name: 'Apple' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    fireEvent.keyDown(input, { key: 'ArrowDown' }); // highlight idx 1
    expect(screen.getByRole('option', { name: 'Apricot' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('Apricot');
  });

  it('closes on Escape', () => {
    render(<Harness />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'Ap' } });
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes when clicking outside the component', () => {
    render(
      <div>
        <Harness />
        <button>outside</button>
      </div>,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Ap' } });
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
