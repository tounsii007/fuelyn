// @vitest-environment jsdom

// ============================================================
// WalletPassButton — POSTs the station snapshot to /api/wallet-pass
// and downloads the returned JSON as a pass file; surfaces a toast
// on success / failure. fetch + URL.createObjectURL are stubbed
// (jsdom implements neither usefully); Toast + translations mocked.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

const { showMock } = vi.hoisted(() => ({ showMock: vi.fn() }));

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: showMock }) }));

import { WalletPassButton } from '../stations/WalletPassButton';

const props = {
  stationId: 'st1',
  stationLabel: 'Aral Hauptstr.',
  fuelLabel: 'Super E10',
  priceEurPerL: '1,749',
};

describe('WalletPassButton', () => {
  beforeEach(() => {
    showMock.mockClear();
    URL.createObjectURL = vi.fn(() => 'blob:fake') as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders the labelled save-to-wallet control', () => {
    render(<WalletPassButton {...props} />);
    expect(screen.getByRole('button', { name: 'walletPass.cta' })).toBeInTheDocument();
  });

  it('posts the snapshot and shows a success toast on a 2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ pass: true }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<WalletPassButton {...props} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'walletPass.cta' }));
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/wallet-pass', expect.objectContaining({ method: 'POST' }));
    expect(showMock).toHaveBeenCalledWith(expect.objectContaining({ tone: 'success' }));
  });

  it('shows a danger toast when the request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);
    render(<WalletPassButton {...props} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'walletPass.cta' }));
    });
    expect(showMock).toHaveBeenCalledWith(expect.objectContaining({ tone: 'danger' }));
  });
});
