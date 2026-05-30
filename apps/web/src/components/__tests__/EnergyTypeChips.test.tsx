// @vitest-environment jsdom

// ============================================================
// EnergyTypeChips — controlled multi-select chip grid keyed off the
// core energy taxonomy (flat + grouped layouts).
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { EnergyTypeChips } from '../stations/EnergyTypeChips';

afterEach(() => cleanup());

describe('EnergyTypeChips', () => {
  it('renders a chip for every energy type in flat mode', () => {
    render(<EnergyTypeChips selected={[]} onChange={vi.fn()} />);
    // 11 energy types across fuel/gas/hydrogen/electric → 11 chip buttons.
    expect(screen.getAllByRole('button')).toHaveLength(11);
    expect(screen.getByRole('button', { name: /Diesel/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Wasserstoff/ })).toBeInTheDocument();
  });

  it('adds a type to the selection when an unselected chip is clicked', () => {
    const onChange = vi.fn();
    render(<EnergyTypeChips selected={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Diesel/ }));
    expect(onChange).toHaveBeenCalledWith(['diesel']);
  });

  it('removes a type from the selection when a selected chip is clicked', () => {
    const onChange = vi.fn();
    render(<EnergyTypeChips selected={['diesel', 'e10']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Diesel/ }));
    expect(onChange).toHaveBeenCalledWith(['e10']);
  });

  it('styles the active chip distinctly from inactive ones', () => {
    render(<EnergyTypeChips selected={['diesel']} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Diesel/ }).className).toMatch(/bg-blue-600/);
    expect(screen.getByRole('button', { name: /Super E5/ }).className).toMatch(/bg-gray-100/);
  });

  it('selects a whole category from its header in grouped mode', () => {
    const onChange = vi.fn();
    render(<EnergyTypeChips selected={[]} onChange={onChange} grouped />);
    fireEvent.click(screen.getByRole('button', { name: 'Kraftstoff' }));
    expect(onChange).toHaveBeenCalledWith(['diesel', 'e5', 'e10', 'super_plus']);
  });
});
