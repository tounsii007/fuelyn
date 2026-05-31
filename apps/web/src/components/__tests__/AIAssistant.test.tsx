// @vitest-environment jsdom

// ============================================================
// AIAssistant — floating chat FAB + slide-in advisor drawer.
// Closed, it shows only the launch FAB. Clicking opens a modal
// dialog with quick-prompt chips and a close button. Firing a
// quick prompt POSTs to /api/ai/advisor (mocked fetchJson) and
// renders the structured recommendation as an assistant reply.
// No translations hook (hardcoded German); real store, mocked
// fetchJson, stubbed scrollIntoView (jsdom has none).
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useAppStore } from '@/lib/store/app-store';

const { fetchJsonMock } = vi.hoisted(() => ({ fetchJsonMock: vi.fn() }));

vi.mock('@/lib/http/fetch-json', () => ({ fetchJson: fetchJsonMock }));

import { AIAssistant } from '../intelligence/AIAssistant';

describe('AIAssistant', () => {
  beforeEach(() => {
    // jsdom doesn't implement scrollIntoView; the drawer auto-scrolls.
    Element.prototype.scrollIntoView = vi.fn();
    fetchJsonMock.mockReset();
    useAppStore.setState((s) => ({
      filter: { ...s.filter, fuelType: 'e10' },
      userLocation: null,
      priceHistory: [],
    }));
  });
  afterEach(() => cleanup());

  it('shows only the launch FAB while closed', () => {
    render(<AIAssistant />);
    expect(screen.getByRole('button', { name: 'AI Assistant öffnen' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the advisor drawer when the FAB is clicked', () => {
    render(<AIAssistant />);
    fireEvent.click(screen.getByRole('button', { name: 'AI Assistant öffnen' }));
    expect(screen.getByRole('dialog', { name: 'AI Assistant' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wann tanken?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schließen' })).toBeInTheDocument();
  });

  it('closes the drawer again from the close button', () => {
    render(<AIAssistant />);
    fireEvent.click(screen.getByRole('button', { name: 'AI Assistant öffnen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'AI Assistant öffnen' })).toBeInTheDocument();
  });

  it('answers a quick prompt via the advisor endpoint', async () => {
    fetchJsonMock.mockResolvedValue({
      recommendation: { headline: 'Jetzt tanken', explanation: 'Der Preis ist gerade niedrig.' },
    });
    render(<AIAssistant />);
    fireEvent.click(screen.getByRole('button', { name: 'AI Assistant öffnen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Wann tanken?' }));

    expect(await screen.findByText(/Der Preis ist gerade niedrig\./)).toBeInTheDocument();
    expect(fetchJsonMock).toHaveBeenCalledWith(
      '/api/ai/advisor',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
