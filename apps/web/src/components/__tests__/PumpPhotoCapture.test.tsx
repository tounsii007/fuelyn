// @vitest-environment jsdom

// ============================================================
// PumpPhotoCapture — pump-display photo → OCR → parsed price.
// Structural twin of ReceiptScanner: the lazy tesseract.js import
// is mocked to a fake worker, recognize() returns canned text, and
// parsePumpDisplay() (real core) produces the ParsedPumpDisplay
// handed to onResult(). We drive the hidden file input directly.
// Unlike ReceiptScanner the status line is a plain <p> (no
// role="status"), so the error branch is asserted via findByText
// against the surfaced message; console.error is silenced for the
// deliberately-thrown failure. Identity translations expose copy
// by key (pumpPhoto.*).
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

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

import { PumpPhotoCapture } from '../stations/PumpPhotoCapture';

function imageFile(text = 'Super E10\n1,799'): File {
  return new File([text], 'pump.jpg', { type: 'image/jpeg' });
}

describe('PumpPhotoCapture', () => {
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

  it('renders the idle CTA and picker', () => {
    render(<PumpPhotoCapture onResult={() => {}} />);
    expect(screen.getByRole('button', { name: 'pumpPhoto.cta' })).toBeInTheDocument();
    expect(screen.getByLabelText('pumpPhoto.pickAria')).toBeInTheDocument();
  });

  it('OCRs the pump photo and hands the parsed result + raw text to onResult', async () => {
    const onResult = vi.fn();
    recognizeMock.mockResolvedValue({ data: { text: 'Super E10\n1,799' } });
    render(<PumpPhotoCapture onResult={onResult} />);

    fireEvent.change(screen.getByLabelText('pumpPhoto.pickAria'), {
      target: { files: [imageFile()] },
    });

    await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    const [, rawText] = onResult.mock.calls[0]!;
    expect(rawText).toContain('E10');
  });

  it('surfaces the OCR error and never calls onResult', async () => {
    const onResult = vi.fn();
    createWorkerMock.mockRejectedValueOnce(new Error('engine boom'));
    render(<PumpPhotoCapture onResult={onResult} />);

    fireEvent.change(screen.getByLabelText('pumpPhoto.pickAria'), {
      target: { files: [imageFile()] },
    });

    expect(await screen.findByText(/engine boom/)).toBeInTheDocument();
    expect(onResult).not.toHaveBeenCalled();
  });
});
