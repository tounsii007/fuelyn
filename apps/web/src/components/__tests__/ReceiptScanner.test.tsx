// @vitest-environment jsdom

// ============================================================
// ReceiptScanner — file/camera → OCR → parsed fuel-log entry.
// We never load the real 4 MB tesseract.js wasm: the component's
// lazy `await import('tesseract.js')` resolves to a hoisted mock
// whose worker.recognize() returns canned text, and parseReceipt()
// (real core) turns that into the ParsedReceipt handed to
// onResult(). The hidden file input is driven directly with a
// fireEvent.change carrying a fake File (the visible button only
// forwards a .click() to it). The happy path is async — import +
// recognize + parse — so we waitFor onResult. The error branch
// rejects the worker factory; the message surfaces in the
// role="status" line, and we silence console.error so the
// deliberately-thrown OCR failure doesn't pollute the log.
// Identity translations expose copy by key.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// The lazy import('tesseract.js') is mocked; createWorker yields a
// fake worker. recognizeMock is mutated per-test to feed OCR text.
const { createWorkerMock, recognizeMock } = vi.hoisted(() => {
  const recognizeMock = vi.fn(async () => ({ data: { text: '' } }));
  const createWorkerMock = vi.fn(async () => ({
    recognize: recognizeMock,
    terminate: vi.fn(async () => {}),
  }));
  return { createWorkerMock, recognizeMock };
});

vi.mock('tesseract.js', () => ({ createWorker: createWorkerMock }));
vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { ReceiptScanner } from '../fuelLog/ReceiptScanner';

function imageFile(text = 'Aral'): File {
  return new File([text], 'receipt.jpg', { type: 'image/jpeg' });
}

describe('ReceiptScanner', () => {
  beforeEach(() => {
    createWorkerMock.mockClear();
    recognizeMock.mockClear();
    recognizeMock.mockResolvedValue({ data: { text: '' } });
    createWorkerMock.mockImplementation(async () => ({
      recognize: recognizeMock,
      terminate: vi.fn(async () => {}),
    }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the idle CTA and picker with no status line', () => {
    render(<ReceiptScanner onResult={() => {}} />);
    expect(screen.getByRole('button', { name: 'receiptScanner.cta' })).toBeInTheDocument();
    expect(screen.getByLabelText('receiptScanner.pickAria')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('OCRs the chosen image and hands the parsed result + raw text to onResult', async () => {
    const onResult = vi.fn();
    recognizeMock.mockResolvedValue({
      data: { text: 'Aral\nSuper E10\n42,00 L\n1,659 EUR/L\n69,68 EUR' },
    });
    render(<ReceiptScanner onResult={onResult} />);

    fireEvent.change(screen.getByLabelText('receiptScanner.pickAria'), {
      target: { files: [imageFile()] },
    });

    await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    const [, rawText] = onResult.mock.calls[0]!;
    expect(rawText).toContain('Aral');
  });

  it('surfaces the OCR error in the status line and never calls onResult', async () => {
    const onResult = vi.fn();
    createWorkerMock.mockRejectedValueOnce(new Error('engine boom'));
    render(<ReceiptScanner onResult={onResult} />);

    fireEvent.change(screen.getByLabelText('receiptScanner.pickAria'), {
      target: { files: [imageFile()] },
    });

    expect(await screen.findByText(/engine boom/)).toBeInTheDocument();
    expect(onResult).not.toHaveBeenCalled();
  });
});
