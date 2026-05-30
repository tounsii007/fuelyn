// @vitest-environment jsdom

// ============================================================
// PriceReportForm — "this price is wrong" submission. Collapsed,
// it is just a CTA; opening drops down a labelled form with a
// fuel picker, price input and submit. Client-side validation
// rejects prices outside the plausible range (toast warning, no
// network); a valid submit POSTs /api/prices/report and toasts
// success. The lazy pump-photo capture is stubbed out via a
// next/dynamic mock; translations + Toast + fetch mocked.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { useAppStore } from '@/lib/store/app-store';

const { showMock } = vi.hoisted(() => ({ showMock: vi.fn() }));

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: showMock }) }));
// Keep the tesseract-backed camera flow out of the bundle/test.
vi.mock('next/dynamic', () => ({ default: () => () => null }));

import { PriceReportForm } from '../stations/PriceReportForm';

describe('PriceReportForm', () => {
  beforeEach(() => {
    showMock.mockReset();
    useAppStore.setState((s) => ({ filter: { ...s.filter, fuelType: 'e10' } }));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders only the CTA while collapsed', () => {
    render(<PriceReportForm stationId="st1" />);
    expect(screen.getByRole('button', { name: 'priceReport.cta' })).toBeInTheDocument();
    expect(screen.queryByRole('form')).toBeNull();
  });

  it('opens the form with fuel picker and submit on CTA press', () => {
    render(<PriceReportForm stationId="st1" />);
    fireEvent.click(screen.getByRole('button', { name: 'priceReport.cta' }));
    expect(screen.getByRole('form', { name: 'priceReport.formAria' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Super E10' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'priceReport.submit' })).toBeInTheDocument();
  });

  it('rejects an out-of-range price with a warning toast and no request', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<PriceReportForm stationId="st1" />);
    fireEvent.click(screen.getByRole('button', { name: 'priceReport.cta' }));
    fireEvent.change(screen.getByPlaceholderText('1,749'), { target: { value: '0,1' } });
    fireEvent.click(screen.getByRole('button', { name: 'priceReport.submit' }));
    expect(showMock).toHaveBeenCalledWith(
      expect.objectContaining({ tone: 'warning', title: 'priceReport.invalidPriceTitle' }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts a valid price and toasts success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, classification: 'no-known-price' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<PriceReportForm stationId="st1" />);
    fireEvent.click(screen.getByRole('button', { name: 'priceReport.cta' }));
    fireEvent.change(screen.getByPlaceholderText('1,749'), { target: { value: '1,749' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'priceReport.submit' }));
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/prices/report', expect.objectContaining({ method: 'POST' }));
    expect(showMock).toHaveBeenCalledWith(
      expect.objectContaining({ tone: 'success', title: 'priceReport.successTitle' }),
    );
  });
});
