// @vitest-environment jsdom

// ============================================================
// AccountDeletePanel — GDPR right-to-erasure, two-step confirm.
// First tap reveals a type-to-confirm input; only the exact
// phrase "LÖSCHEN" arms the DELETE /api/account call. Success
// wipes local + session storage and toasts; a non-2xx toasts an
// error. fetch + both storages stubbed (jsdom's are unusable);
// Toast + translations mocked.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

const { showMock } = vi.hoisted(() => ({ showMock: vi.fn() }));

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: showMock }) }));

import { AccountDeletePanel } from '../settings/AccountDeletePanel';

function makeStorageStub(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? (m.get(k) ?? null) : null),
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  };
}

const arm = () => {
  fireEvent.click(screen.getByRole('button', { name: 'accountDelete.openCta' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'LÖSCHEN' } });
};

describe('AccountDeletePanel', () => {
  beforeEach(() => {
    showMock.mockClear();
    vi.stubGlobal('localStorage', makeStorageStub());
    vi.stubGlobal('sessionStorage', makeStorageStub());
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('hides the destructive input behind the first-step CTA', () => {
    render(<AccountDeletePanel />);
    expect(screen.getByRole('region', { name: 'accountDelete.title' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'accountDelete.openCta' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('keeps the confirm button disabled until the exact phrase is typed', () => {
    render(<AccountDeletePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'accountDelete.openCta' }));
    const confirm = screen.getByRole('button', { name: 'accountDelete.confirmCta' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'LÖSCHEN' } });
    expect(confirm).toBeEnabled();
  });

  it('fires the DELETE call and a success toast on a 2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    render(<AccountDeletePanel />);
    arm();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'accountDelete.confirmCta' }));
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/account', expect.objectContaining({ method: 'DELETE' }));
    expect(showMock).toHaveBeenCalledWith(expect.objectContaining({ tone: 'success' }));
  });

  it('shows an error toast when the deletion request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    render(<AccountDeletePanel />);
    arm();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'accountDelete.confirmCta' }));
    });
    expect(showMock).toHaveBeenCalledWith(expect.objectContaining({ tone: 'danger' }));
  });
});
