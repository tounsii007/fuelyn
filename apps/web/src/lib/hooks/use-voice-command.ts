// ============================================================
// Fuelyn Web — useVoiceCommand Hook
// Wraps the Web Speech API SpeechRecognition lifecycle and
// pipes the final transcript through the @fuelyn/core voice
// intent parser. UI components only see the high-level
// "listening" state, the latest transcript, and the resolved
// intent — they don't have to know about onresult / onerror /
// timeouts.
// ============================================================

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { parseVoiceIntent, type VoiceIntent } from '@fuelyn/core';

// -----------------------------------------------------------------
// Browser typings — Web Speech is not in lib.dom.d.ts on every TS
// release, so we declare the bits we actually use locally.
// -----------------------------------------------------------------

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }>;
  resultIndex: number;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  onaudiostart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionCtor {
  new (): SpeechRecognitionLike;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

// -----------------------------------------------------------------
// Public API
// -----------------------------------------------------------------

export type VoiceCommandStatus =
  | 'idle'
  | 'starting'
  | 'listening'
  | 'processing'
  | 'denied'
  | 'unsupported'
  | 'error';

export interface UseVoiceCommandOptions {
  /** BCP-47 language tag for the recognizer (default: navigator.language ?? 'de-DE'). */
  lang?: string;
  /** Auto-stop after this many ms of audio with no result (default: 6000). */
  silenceTimeoutMs?: number;
  /** Forced locale hint for the parser. Otherwise sniffed from the first 2 chars of `lang`. */
  parserLocale?: 'de' | 'en';
  /** Called once a final transcript has been parsed into an intent. */
  onIntent?: (intent: VoiceIntent) => void;
}

export interface UseVoiceCommandReturn {
  /** Current state of the recognizer. */
  status: VoiceCommandStatus;
  /** Whether the browser exposes a SpeechRecognition implementation. */
  isSupported: boolean;
  /** Latest interim or final transcript. */
  transcript: string;
  /** Latest parsed intent (final transcripts only), or null. */
  intent: VoiceIntent | null;
  /** Last error message, or null. */
  error: string | null;
  /** Begin listening (no-op if already listening or unsupported). */
  start: () => void;
  /** Stop listening — finalises any in-progress audio. */
  stop: () => void;
  /** Cancel listening — drops the current audio without finalising. */
  cancel: () => void;
  /** Reset transcript+intent+error to their initial values. */
  reset: () => void;
}

// -----------------------------------------------------------------
// Hook
// -----------------------------------------------------------------

export function useVoiceCommand(opts: UseVoiceCommandOptions = {}): UseVoiceCommandReturn {
  const {
    lang,
    silenceTimeoutMs = 6000,
    parserLocale,
    onIntent,
  } = opts;

  const [status, setStatus] = useState<VoiceCommandStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [intent, setIntent] = useState<VoiceIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  // Refs that don't need to trigger re-render when they change.
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onIntentRef = useRef(onIntent);
  // React 19 / next-lint forbids assigning .current during render — sync
  // the latest callback inside an effect instead. The callback runs on
  // every render, so the ref always holds the most recent function.
  useEffect(() => {
    onIntentRef.current = onIntent;
  });

  // Detect support once on mount.
  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsSupported(false);
      setStatus('unsupported');
      return;
    }
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setIsSupported(false);
      setStatus('unsupported');
    }
  }, []);

  const cleanupTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    cleanupTimer();
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore — already stopped */
    }
  }, [cleanupTimer]);

  const cancel = useCallback(() => {
    cleanupTimer();
    try {
      recognitionRef.current?.abort();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
    setStatus('idle');
  }, [cleanupTimer]);

  const reset = useCallback(() => {
    setTranscript('');
    setIntent(null);
    setError(null);
  }, []);

  const start = useCallback(() => {
    if (typeof window === 'undefined') return;
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setStatus('unsupported');
      return;
    }
    if (recognitionRef.current) return; // already running

    const rec = new Ctor();
    const effectiveLang =
      lang ?? (typeof navigator !== 'undefined' ? navigator.language : 'de-DE');
    rec.lang = effectiveLang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onaudiostart = () => {
      setStatus('listening');
      cleanupTimer();
      silenceTimerRef.current = setTimeout(() => {
        try {
          rec.stop();
        } catch {
          /* ignore */
        }
      }, silenceTimeoutMs);
    };

    rec.onresult = (ev) => {
      let finalText = '';
      let interimText = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i]!;
        const alt = res[0]!;
        if (res.isFinal) finalText += alt.transcript;
        else interimText += alt.transcript;
      }
      const combined = (finalText || interimText).trim();
      if (combined) setTranscript(combined);
      if (finalText.trim()) {
        setStatus('processing');
        const sniff: 'de' | 'en' =
          parserLocale ?? (effectiveLang.toLowerCase().startsWith('de') ? 'de' : 'en');
        const parsed = parseVoiceIntent(finalText.trim(), { locale: sniff });
        setIntent(parsed);
        onIntentRef.current?.(parsed);
      }
    };

    rec.onerror = (ev) => {
      cleanupTimer();
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        setStatus('denied');
        setError('microphone-permission-denied');
      } else if (ev.error === 'no-speech') {
        setStatus('idle');
        setError(null);
      } else {
        setStatus('error');
        setError(ev.error);
      }
    };

    rec.onend = () => {
      cleanupTimer();
      recognitionRef.current = null;
      setStatus((prev) => (prev === 'processing' || prev === 'denied' || prev === 'error' ? prev : 'idle'));
    };

    setError(null);
    setIntent(null);
    setTranscript('');
    setStatus('starting');
    recognitionRef.current = rec;
    try {
      rec.start();
    } catch (err) {
      // Some browsers throw "InvalidStateError" if start is called twice.
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
      recognitionRef.current = null;
    }
  }, [cleanupTimer, lang, parserLocale, silenceTimeoutMs]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      cleanupTimer();
      try {
        recognitionRef.current?.abort();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    };
  }, [cleanupTimer]);

  return {
    status,
    isSupported,
    transcript,
    intent,
    error,
    start,
    stop,
    cancel,
    reset,
  };
}
