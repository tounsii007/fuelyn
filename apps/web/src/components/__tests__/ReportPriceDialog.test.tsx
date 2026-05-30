// @vitest-environment jsdom

// ============================================================
// ReportPriceDialog — modal for submitting a price correction.
// Closed when open=false. Client-side validation rejects prices
// outside (0, 99] before any network call; a valid submit POSTs
// to /api/reports via fetchJson and flips to the success state.
// Copy is hardcoded German; fetchJson is mocked.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

const { fetchJsonMock } = vi.hoisted(() => ({ fetchJsonMock: vi.fn() }));

vi.mock('@/lib/http/fetch-json', () => ({ fetchJson: fetchJsonMock }));

import { ReportPriceDialog } from '../stations/ReportPriceDialog';

const props = {
  open: true,
  onClose: () => {},
  stationId: 'st1',
  stationName: 'Aral Hauptstr.',
  fuelType: 'e10' as const,
  displayedPrice: 1.799,
};

describe('ReportPriceDialog', () => {
  beforeEach(() => {
    fetchJsonMock.mockReset();
    fetchJsonMock.mockResolvedValue({ id: 1, status: 'ok' });
  });
  afterEach(() => cleanup());

  it('renders nothing while closed', () => {
    const { container } = render(<ReportPriceDialog {...props} open={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the dialog with the submit disabled until a price is entered', () => {
    render(<ReportPriceDialog {...props} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Preis melden')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Übermitteln' })).toBeDisabled();
  });

  it('rejects an out-of-range price without calling the API', () => {
    render(<ReportPriceDialog {...props} />);
    fireEvent.change(screen.getByPlaceholderText('z. B. 1,899'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Übermitteln' }));
    expect(screen.getByText(/gültigen Preis/)).toBeInTheDocument();
    expect(fetchJsonMock).not.toHaveBeenCalled();
  });

  it('posts a valid corrected price and flips to the thank-you state', async () => {
    render(<ReportPriceDialog {...props} />);
    fireEvent.change(screen.getByPlaceholderText('z. B. 1,899'), { target: { value: '1,899' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Übermitteln' }));
    });
    expect(fetchJsonMock).toHaveBeenCalledWith(
      '/api/reports',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({ stationId: 'st1', fuelType: 'e10', reportedPrice: 1.899 }),
      }),
    );
    expect(screen.getByRole('heading', { name: 'Danke!' })).toBeInTheDocument();
  });
});
