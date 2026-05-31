// @vitest-environment jsdom

// ============================================================
// VehicleManager — multi-vehicle picker at the top of /vehicle.
// Renders nothing until at least one vehicle is saved. With a
// couple of profiles it surfaces a labelled region, an add
// button, and one selectable row per vehicle (aria-pressed marks
// the active one). Clicking a row promotes that vehicle to
// active; deleting is a two-step confirm. Identity translations;
// real store (real add/remove/setActive actions).
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { VehicleProfile } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { VehicleManager } from '../vehicle/VehicleManager';

const vehicle = (over: Partial<VehicleProfile> = {}): VehicleProfile => ({
  id: 'v1',
  name: 'Auto A',
  fuelType: 'e10',
  driveType: 'benzin',
  consumption: 6,
  tankCapacity: 50,
  batteryCapacity: null,
  currentRange: null,
  currentFuelLevel: null,
  currentFuelUnit: 'liters',
  ...over,
});

describe('VehicleManager', () => {
  beforeEach(() => {
    useAppStore.setState({ vehicles: [], activeVehicleId: null });
  });
  afterEach(() => cleanup());

  it('renders nothing until a vehicle is saved', () => {
    const { container } = render(<VehicleManager />);
    expect(container.firstChild).toBeNull();
  });

  it('lists saved vehicles and marks the active one', () => {
    useAppStore.setState({
      vehicles: [vehicle({ id: 'a', name: 'Auto A' }), vehicle({ id: 'b', name: 'Auto B' })],
      activeVehicleId: 'a',
    });
    render(<VehicleManager />);
    expect(screen.getByRole('region', { name: 'vehicleManager.title' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /vehicleManager\.add/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Auto A/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Auto B/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('promotes a vehicle to active when its row is clicked', () => {
    useAppStore.setState({
      vehicles: [vehicle({ id: 'a', name: 'Auto A' }), vehicle({ id: 'b', name: 'Auto B' })],
      activeVehicleId: 'a',
    });
    render(<VehicleManager />);
    fireEvent.click(screen.getByRole('button', { name: /Auto B/ }));
    expect(useAppStore.getState().activeVehicleId).toBe('b');
  });

  it('requires a second click to confirm a delete', () => {
    useAppStore.setState({
      vehicles: [vehicle({ id: 'a', name: 'Auto A' }), vehicle({ id: 'b', name: 'Auto B' })],
      activeVehicleId: 'a',
    });
    render(<VehicleManager />);
    const deletes = screen.getAllByRole('button', { name: 'vehicleManager.delete' });
    expect(deletes).toHaveLength(2);

    // First click on B's delete arms the confirm (label flips to
    // confirmDelete); the vehicle is still present.
    fireEvent.click(deletes[1]!);
    expect(useAppStore.getState().vehicles).toHaveLength(2);

    // Second click on the now-armed button removes it.
    fireEvent.click(screen.getByRole('button', { name: 'vehicleManager.confirmDelete' }));
    expect(useAppStore.getState().vehicles.map((v) => v.id)).toEqual(['a']);
  });
});
