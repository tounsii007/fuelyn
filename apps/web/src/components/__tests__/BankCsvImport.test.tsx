// @vitest-environment jsdom

// ============================================================
// BankCsvImport — sister importer that turns an online-banking
// CSV export into stub fuel-log entries (litres / €-per-litre
// left at 0 for the user to fill). Renders a titled card with a
// CTA; picking a CSV with recognisable fuel-station rows shows a
// preview plus the confirm CTA, which merges the stubs into the
// store. Identity translations; mocked Toast; real store + real
// core bank parser.
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

import { BankCsvImport } from '../settings/BankCsvImport';

// DKB-style export: Buchungstag + Verwendungszweck mark the header;
// both lines are in-range debits at recognised fuel brands.
const CSV = [
  'Buchungstag;Auftraggeber;Verwendungszweck;Betrag',
  '05.05.2026;Aral Tankstelle;Tanken;-72,50',
  '07.05.2026;Shell Station;Kraftstoff;-65,00',
].join('\n');

describe('BankCsvImport', () => {
  beforeEach(() => {
    showMock.mockClear();
    useAppStore.setState((s) => ({ fuelLog: [], filter: { ...s.filter, fuelType: 'diesel' } }));
  });
  afterEach(() => cleanup());

  it('renders the import card with its file-pick CTA', () => {
    render(<BankCsvImport />);
    expect(screen.getByText('bankImport.title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'bankImport.cta' })).toBeInTheDocument();
  });

  it('imports a bank CSV and merges the detected fuel rows', async () => {
    render(<BankCsvImport />);
    const input = screen.getByLabelText('bankImport.pickAria');
    const file = new File([CSV], 'umsaetze.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    // Confirm CTA only renders once the parse populates the preview.
    const confirm = await screen.findByRole('button', { name: 'bankImport.confirmCta' });
    fireEvent.click(confirm);

    expect(useAppStore.getState().fuelLog).toHaveLength(2);
    expect(showMock).toHaveBeenCalledWith(expect.objectContaining({ tone: 'success' }));
  });
});
