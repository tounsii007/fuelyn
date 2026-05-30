// @vitest-environment jsdom

// ============================================================
// VehicleForm — inline vehicle-profile editor. The model field is
// an Autocomplete (role=combobox); the consumption field is a
// labelled number input. A valid submit persists through the real
// store via useVehicleActions (a thin setVehicle wrapper) and then
// calls onClose. Identity translations; real store + core models.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useAppStore } from '@/lib/store/app-store';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { VehicleForm } from '../vehicle/VehicleForm';

describe('VehicleForm', () => {
  beforeEach(() => {
    useAppStore.setState({ vehicle: null });
  });
  afterEach(() => cleanup());

  it('renders the titled form with model field, save and close controls', () => {
    render(<VehicleForm onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: 'vehicle.title' })).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'vehicle.saveVehicle' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'common.close' })).toBeInTheDocument();
  });

  it('invokes onClose when the close button is pressed', () => {
    const onClose = vi.fn();
    render(<VehicleForm onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('persists a valid vehicle and closes on submit', () => {
    const onClose = vi.fn();
    render(<VehicleForm onClose={onClose} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Mein Auto' } });
    fireEvent.change(screen.getByLabelText(/vehicle\.consumptionShort/), { target: { value: '7.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'vehicle.saveVehicle' }));

    const saved = useAppStore.getState().vehicle;
    expect(saved?.name).toBe('Mein Auto');
    expect(saved?.consumption).toBe(7.5);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
