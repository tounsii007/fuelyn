// @vitest-environment jsdom

// ============================================================
// AddressSearch — formatReverseLabel + GeolocateButton state machine
//
// We test the pure helpers and the visual rendering of the
// geolocate button across its four states. The full
// reverse-geocode HTTP path is exercised separately via
// fetchJson mocks.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AddressSearch } from '../stations/AddressSearch';
import { useAppStore } from '@/lib/store/app-store';

// Stub out fetchJson so Nominatim never gets called in unit tests.
vi.mock('@/lib/http/fetch-json', () => ({
  fetchJson: vi.fn(async () => []),
}));

// Stub the geolocation hook with a controllable mock.
vi.mock('@/lib/hooks/use-location', () => {
  const requestLocation = vi.fn();
  return {
    useGeolocation: vi.fn(() => ({
      userLocation: null,
      permission: 'prompt',
      requestLocation,
      insecureContext: false,
    })),
  };
});

import { fetchJson } from '@/lib/http/fetch-json';
import { useGeolocation } from '@/lib/hooks/use-location';

const mockFetchJson = vi.mocked(fetchJson);
const mockUseGeolocation = vi.mocked(useGeolocation);

describe('AddressSearch — geolocate button', () => {
  beforeEach(() => {
    mockFetchJson.mockReset();
    mockUseGeolocation.mockReset();
    mockUseGeolocation.mockReturnValue({
      userLocation: null,
      permission: 'prompt',
      requestLocation: vi.fn(),
      insecureContext: false,
    });
    // Reset zustand store between tests
    useAppStore.setState({ userLocation: null });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the crosshair button in idle state by default', () => {
    render(<AddressSearch />);
    const btn = screen.getByLabelText('Aktuellen Standort verwenden');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('aria-label', 'Aktuellen Standort verwenden');
    expect(btn).not.toBeDisabled();
  });

  it('triggers requestLocation on click and switches to locating state', () => {
    const requestLocation = vi.fn();
    mockUseGeolocation.mockReturnValue({
      userLocation: null,
      permission: 'prompt',
      requestLocation,
      insecureContext: false,
    });

    render(<AddressSearch />);
    const btn = screen.getByLabelText('Aktuellen Standort verwenden');
    fireEvent.click(btn);

    expect(requestLocation).toHaveBeenCalledTimes(1);
    // After click, button label and aria-busy update
    expect(screen.getByLabelText('Standort wird ermittelt…')).toBeDisabled();
    expect(screen.getByLabelText('Standort wird ermittelt…')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows an amber error banner when permission is denied during a request', async () => {
    const requestLocation = vi.fn();
    const { rerender } = render(<AddressSearch />);

    // Click → switches to locating
    fireEvent.click(screen.getByLabelText('Aktuellen Standort verwenden'));

    // Hook now reports denial
    mockUseGeolocation.mockReturnValue({
      userLocation: null,
      permission: 'denied',
      requestLocation,
      insecureContext: false,
    });
    rerender(<AddressSearch />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Standortzugriff verweigert/);
    });
    // Button is back to a clickable error state
    expect(
      screen.getByLabelText(/Standort nicht verfügbar/),
    ).not.toBeDisabled();
  });

  it('shows the HTTPS-required hint when running on insecure context', async () => {
    mockUseGeolocation.mockReturnValue({
      userLocation: null,
      permission: 'prompt',
      requestLocation: vi.fn(),
      insecureContext: true,
    });

    const { rerender } = render(<AddressSearch />);
    fireEvent.click(screen.getByLabelText('Aktuellen Standort verwenden'));

    mockUseGeolocation.mockReturnValue({
      userLocation: null,
      permission: 'denied',
      requestLocation: vi.fn(),
      insecureContext: true,
    });
    rerender(<AddressSearch />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/HTTPS/i);
    });
  });

  it('reverse-geocodes the resolved coords and writes a label into the input', async () => {
    mockFetchJson.mockResolvedValueOnce({
      display_name: 'Hauptstraße 12, 35390 Gießen, Hessen, Deutschland',
      address: {
        road: 'Hauptstraße',
        house_number: '12',
        postcode: '35390',
        city: 'Gießen',
      },
    });

    const { rerender } = render(<AddressSearch />);
    fireEvent.click(screen.getByLabelText('Aktuellen Standort verwenden'));

    // Hook now reports a successful location
    mockUseGeolocation.mockReturnValue({
      userLocation: { lat: 50.5867, lng: 8.6783 },
      permission: 'granted',
      requestLocation: vi.fn(),
      insecureContext: false,
    });
    useAppStore.setState({ userLocation: { lat: 50.5867, lng: 8.6783 } });
    rerender(<AddressSearch />);

    await waitFor(() => {
      const input = screen.getByPlaceholderText(/Ort, PLZ oder Adresse/);
      expect(input).toHaveValue('Hauptstraße 12, 35390 Gießen');
    });
    // Reverse-geocode should have hit the Nominatim reverse endpoint
    expect(mockFetchJson).toHaveBeenCalledWith(
      expect.stringContaining('/reverse?'),
      expect.any(Object),
    );
  });
});

describe('AddressSearch — text-search & clear', () => {
  beforeEach(() => {
    mockFetchJson.mockReset();
    mockFetchJson.mockResolvedValue([]);
    mockUseGeolocation.mockReturnValue({
      userLocation: null,
      permission: 'prompt',
      requestLocation: vi.fn(),
      insecureContext: false,
    });
  });

  afterEach(() => cleanup());

  it('shows a clear button only when the input has text', () => {
    render(<AddressSearch />);
    expect(screen.queryByLabelText('Eingabe löschen')).not.toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Ort, PLZ oder Adresse/);
    fireEvent.change(input, { target: { value: 'Berlin' } });

    expect(screen.getByLabelText('Eingabe löschen')).toBeInTheDocument();
  });

  it('clearing the input restores the geolocate button alone', () => {
    render(<AddressSearch />);
    const input = screen.getByPlaceholderText(/Ort, PLZ oder Adresse/);
    fireEvent.change(input, { target: { value: 'Berlin' } });

    fireEvent.click(screen.getByLabelText('Eingabe löschen'));

    expect((input as HTMLInputElement).value).toBe('');
    expect(screen.queryByLabelText('Eingabe löschen')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Aktuellen Standort verwenden')).toBeInTheDocument();
  });
});
