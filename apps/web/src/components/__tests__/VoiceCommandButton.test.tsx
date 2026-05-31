// @vitest-environment jsdom

// ============================================================
// VoiceCommandButton — floating tap-to-speak FAB + listening
// dialog. SSR-safe: renders nothing until hydrated AND the
// browser exposes SpeechRecognition. Tapping the FAB resets +
// starts the recognizer and opens a modal dialog; the dialog's
// close button hides it again. We mock the speech hook
// (isSupported/status/…) and the hydration gate so the button
// renders deterministically. Separately, the exported pure
// executeIntent() is unit-tested against a hand-built context.
// Mocked: useVoiceCommand, useIsHydrated, next/navigation,
// translations (identity), Toast.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { UseVoiceCommandReturn } from '@/lib/hooks/use-voice-command';
import type { VoiceIntent } from '@fuelyn/core';

const { voiceMock, startMock, cancelMock, resetMock, pushMock, showMock } = vi.hoisted(() => {
  const startMock = vi.fn();
  const cancelMock = vi.fn();
  const resetMock = vi.fn();
  const pushMock = vi.fn();
  const showMock = vi.fn();
  // Typed as the real hook return so the component compiles against
  // it; fields are mutated per-test (isSupported gate, etc.).
  const voiceMock: UseVoiceCommandReturn = {
    status: 'idle',
    isSupported: true,
    transcript: '',
    intent: null,
    error: null,
    start: startMock,
    stop: vi.fn(),
    cancel: cancelMock,
    reset: resetMock,
  };
  return { voiceMock, startMock, cancelMock, resetMock, pushMock, showMock };
});

vi.mock('@/lib/hooks/use-is-hydrated', () => ({ useIsHydrated: () => true }));
vi.mock('@/lib/hooks/use-voice-command', () => ({ useVoiceCommand: () => voiceMock }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: showMock }) }));

import { VoiceCommandButton, executeIntent } from '../voice/VoiceCommandButton';

// ExecuteContext isn't exported — derive its shape from the function.
type ExecCtx = Parameters<typeof executeIntent>[1];

function makeIntent(intent: VoiceIntent['intent'], slots: VoiceIntent['slots'] = {}): VoiceIntent {
  return { intent, slots, confidence: 0.9, utterance: 'x', locale: 'de' };
}

function makeCtx() {
  const push = vi.fn();
  const setFuelType = vi.fn();
  const setMapRadiusKm = vi.fn();
  const toast = vi.fn();
  const ctx: ExecCtx = {
    router: { push } as unknown as ExecCtx['router'],
    setFuelType,
    setMapRadiusKm,
    toast,
  };
  return { ctx, push, setFuelType, setMapRadiusKm, toast };
}

describe('VoiceCommandButton', () => {
  beforeEach(() => {
    voiceMock.isSupported = true;
    voiceMock.status = 'idle';
    voiceMock.transcript = '';
    voiceMock.intent = null;
    voiceMock.error = null;
    startMock.mockClear();
    cancelMock.mockClear();
    resetMock.mockClear();
    pushMock.mockClear();
    showMock.mockClear();
  });
  afterEach(() => cleanup());

  it('renders nothing when speech recognition is unsupported', () => {
    voiceMock.isSupported = false;
    const { container } = render(<VoiceCommandButton />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the mic FAB once hydrated and supported', () => {
    render(<VoiceCommandButton />);
    expect(screen.getByRole('button', { name: 'voice.openMicAria' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the listening dialog and starts recognition when tapped', () => {
    render(<VoiceCommandButton />);
    fireEvent.click(screen.getByRole('button', { name: 'voice.openMicAria' }));
    expect(screen.getByRole('dialog', { name: 'voice.dialogAria' })).toBeInTheDocument();
    expect(resetMock).toHaveBeenCalled();
    expect(startMock).toHaveBeenCalled();
  });

  it('closes the dialog from its close button', () => {
    render(<VoiceCommandButton />);
    fireEvent.click(screen.getByRole('button', { name: 'voice.openMicAria' }));
    fireEvent.click(screen.getByRole('button', { name: 'voice.closeAria' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  describe('executeIntent', () => {
    it('switch-fuel sets the fuel type and toasts the choice', () => {
      const { ctx, setFuelType, toast } = makeCtx();
      executeIntent(makeIntent('switch-fuel', { fuel: 'diesel' }), ctx);
      expect(setFuelType).toHaveBeenCalledWith('diesel');
      expect(toast).toHaveBeenCalledWith('DIESEL ✓');
    });

    it('show-stats routes to the stats page', () => {
      const { ctx, push } = makeCtx();
      executeIntent(makeIntent('show-stats'), ctx);
      expect(push).toHaveBeenCalledWith('/stats?source=voice');
    });

    it('set-radius updates the map radius and toasts', () => {
      const { ctx, setMapRadiusKm, toast } = makeCtx();
      executeIntent(makeIntent('set-radius', { radiusKm: 8 }), ctx);
      expect(setMapRadiusKm).toHaveBeenCalledWith(8);
      expect(toast).toHaveBeenCalledWith('8 km ✓');
    });
  });
});
