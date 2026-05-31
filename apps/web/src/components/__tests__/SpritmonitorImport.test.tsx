// @vitest-environment jsdom

// ============================================================
// SpritmonitorImport — CSV importer for spritmonitor.de exports.
// Renders a titled card with a file-pick CTA. Picking a valid
// semicolon CSV parses it (real @fuelyn/core parser) and shows a
// preview (role="status"); confirming merges the fresh entries
// into the store's fuel-log and fires a success toast. Identity
// translations; mocked Toast; real store + real core parser.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useAppStore } from '@/lib/store/app-store';

const { showMock } = vi.hoisted(() => ({ showMock: vi.fn() }));

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ show: showMock }),
}));

import { SpritmonitorImport } from '../settings/SpritmonitorImport';

// German semicolon export: Datum / Menge / Kraftstoff are the
// required columns; Preis + Gesamtpreis + station give a full row.
const CSV = [
  'Datum;Kilometerstand;Menge;Preis;Gesamtpreis;Kraftstoff;Tankstelle;Marke',
  '01.05.2026;12000;40,00;1,75;70,00;Diesel;Aral Trier;Aral',
  '03.05.2026;12500;38,50;1,73;66,61;Diesel;Shell Trier;Shell',
].join('\n');

describe('SpritmonitorImport', () => {
  beforeEach(() => {
    showMock.mockClear();
    useAppStore.setState({ fuelLog: [] });
  });
  afterEach(() => cleanup());

  it('renders the import card with its file-pick CTA', () => {
    render(<SpritmonitorImport />);
    expect(screen.getByText('spritmonitor.title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'spritmonitor.cta' })).toBeInTheDocument();
  });

  it('imports a valid CSV and merges the fresh fills into the log', async () => {
    render(<SpritmonitorImport />);
    const input = screen.getByLabelText('spritmonitor.pickAria');
    const file = new File([CSV], 'fills.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    // Preview surfaces once the async parse resolves.
    await screen.findByRole('status');

    fireEvent.click(screen.getByRole('button', { name: 'spritmonitor.confirmCta' }));
    expect(useAppStore.getState().fuelLog).toHaveLength(2);
    expect(showMock).toHaveBeenCalledWith(expect.objectContaining({ tone: 'success' }));
  });
});
