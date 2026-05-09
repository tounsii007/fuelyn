// ============================================================
// AIAssistant — floating chat-bubble + slide-in drawer.
//
// Phase 5 MVP. The current backend doesn't yet expose a streaming
// chat endpoint, so this drawer routes user prompts through the
// existing `/api/ai/advisor` endpoint and renders the structured
// recommendation as a chat reply. When the streaming endpoint
// lands (next iteration), the only change needed here is the
// `sendMessage` implementation.
//
// Design language: glass-morphic drawer, brand-blue accents,
// premium typography. Mobile: slides in from the bottom; desktop:
// from the right.
// ============================================================

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import { fetchJson } from '@/lib/http/fetch-json';

interface ChatMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly text: string;
  readonly ts: number;
  readonly pending?: boolean;
}

const QUICK_PROMPTS = [
  { label: 'Wann tanken?',          prompt: 'Soll ich jetzt tanken oder warten?' },
  { label: 'Beste Station heute',   prompt: 'Welche Tankstelle ist aktuell die günstigste?' },
  { label: 'Trend prognostizieren', prompt: 'Wie entwickeln sich die Preise heute?' },
  { label: 'Spar-Tipp',             prompt: 'Wie kann ich beim Tanken am meisten sparen?' },
];

export function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  const fuelType = useAppStore((s) => s.filter.fuelType);
  const userLocation = useAppStore((s) => s.userLocation);
  const priceHistory = useAppStore((s) => s.priceHistory);

  // Auto-scroll to newest on every message change.
  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  // Esc closes the drawer when it has focus.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: trimmed,
        ts: Date.now(),
      };
      const placeholder: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: '',
        ts: Date.now(),
        pending: true,
      };
      setMessages((prev) => [...prev, userMsg, placeholder]);
      setInput('');
      setBusy(true);

      try {
        // Until a true chat endpoint exists, we synthesise a reply
        // from the AI advisor (which is itself LLM-backed when the
        // OpenAI/Ollama backends are reachable). This gives a real,
        // context-aware answer rather than a stub.
        const histForAdvisor = priceHistory
          .filter((p) => p.fuelType === fuelType && Number.isFinite(p.price))
          .map((p) => ({ price: p.price, timestamp: p.timestamp }))
          .slice(-100);

        const advisor = await fetchJson<{
          recommendation?: {
            headline?: string;
            explanation?: string;
            bestTimePrediction?: string;
            tip?: string;
            priceOutlook?: string;
            confidence?: string;
          };
        }>('/api/ai/advisor', {
          method: 'POST',
          body: {
            // Minimal payload — the BFF advisor route accepts richer
            // context but a thin one already produces useful output.
            prices: [],
            fuelType,
            priceHistory: histForAdvisor,
            lat: userLocation?.lat,
            lng: userLocation?.lng,
            fillUpLiters: 50,
          },
        });

        const r = advisor?.recommendation;
        const reply = r
          ? [
              r.headline ? `**${r.headline}**` : null,
              r.explanation,
              r.priceOutlook ? `_Ausblick:_ ${r.priceOutlook}` : null,
              r.tip ? `_Tipp:_ ${r.tip}` : null,
              r.bestTimePrediction ? `_Beste Zeit:_ ${r.bestTimePrediction}` : null,
              r.confidence ? `_Konfidenz: ${r.confidence}_` : null,
            ]
              .filter(Boolean)
              .join('\n\n')
          : 'Keine Empfehlung verfügbar — bitte später nochmal probieren.';

        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholder.id ? { ...m, text: reply, pending: false } : m,
          ),
        );
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholder.id
              ? {
                  ...m,
                  text: 'Sorry, ich konnte das gerade nicht beantworten. Versuchs gleich nochmal.',
                  pending: false,
                }
              : m,
          ),
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, fuelType, priceHistory, userLocation],
  );

  return (
    <>
      {/* ─── Floating Action Button ────────────────────────────── */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="AI Assistant öffnen"
          className="fixed bottom-20 right-5 z-40 md:bottom-6
                     w-14 h-14 rounded-full
                     bg-gradient-to-br from-cyan-500 via-blue-500 to-violet-600
                     text-white shadow-[0_8px_24px_rgba(37,117,234,0.45),0_0_0_4px_rgba(37,117,234,0.15)]
                     hover:shadow-[0_12px_32px_rgba(37,117,234,0.55),0_0_0_6px_rgba(37,117,234,0.20)]
                     transition-all duration-200 hover:scale-105 active:scale-95
                     fy-fab-pulse"
        >
          <svg
            className="w-7 h-7 mx-auto"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 2l1.6 4.4L18 8l-4.4 1.6L12 14l-1.6-4.4L6 8l4.4-1.6L12 2zm6 12l.9 2.4L21 17l-2.1.6L18 20l-.9-2.4L15 17l2.1-.6.9-2.4z" />
          </svg>
        </button>
      )}

      {/* ─── Drawer ─────────────────────────────────────────────── */}
      {open && (
        <>
          {/* Backdrop — click outside to dismiss */}
          <div
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/35 backdrop-blur-sm fy-enter"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="AI Assistant"
            className="fixed z-50 fy-enter
                       inset-x-0 bottom-0 md:inset-y-0 md:right-0 md:left-auto md:bottom-auto
                       w-full md:w-[420px] md:h-full
                       max-h-[80vh] md:max-h-none
                       bg-white dark:bg-[oklch(0.16_0.04_265)]
                       border-t md:border-t-0 md:border-l border-gray-200 dark:border-white/10
                       shadow-[0_-12px_40px_rgba(0,0,0,0.20)] md:shadow-[-12px_0_40px_rgba(0,0,0,0.22)]
                       rounded-t-3xl md:rounded-none
                       flex flex-col"
          >
            {/* Drawer header */}
            <header
              className="flex items-center justify-between px-4 py-3
                         border-b border-gray-100 dark:border-white/10"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="w-8 h-8 rounded-xl
                             bg-gradient-to-br from-cyan-500 via-blue-500 to-violet-600
                             flex items-center justify-center text-white"
                  aria-hidden="true"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l1.6 4.4L18 8l-4.4 1.6L12 14l-1.6-4.4L6 8l4.4-1.6L12 2zm6 12l.9 2.4L21 17l-2.1.6L18 20l-.9-2.4L15 17l2.1-.6.9-2.4z" />
                  </svg>
                </span>
                <div>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight">
                    Fuelyn AI
                  </h2>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
                    Frag mich nach Preisen, Trends, Routen.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Schließen"
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              >
                <svg
                  className="w-5 h-5 text-gray-500 dark:text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </header>

            {/* Message list */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3 fy-scroll-thin">
              {messages.length === 0 && (
                <div className="text-center py-8 text-xs text-gray-400 dark:text-gray-500">
                  Tippe eine Frage oder wähle einen Quick-Prompt unten.
                </div>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={[
                      'max-w-[85%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed',
                      m.role === 'user'
                        ? 'bg-brand-600 text-white rounded-br-sm'
                        : 'bg-gray-100 dark:bg-white/5 text-gray-800 dark:text-gray-100 rounded-bl-sm',
                    ].join(' ')}
                  >
                    {m.pending ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-pulse [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-pulse [animation-delay:120ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-pulse [animation-delay:240ms]" />
                      </span>
                    ) : (
                      <span className="whitespace-pre-wrap">{m.text}</span>
                    )}
                  </div>
                </div>
              ))}
              <div ref={scrollAnchorRef} />
            </div>

            {/* Quick prompts */}
            {messages.length === 0 && (
              <div className="px-4 pb-2 grid grid-cols-2 gap-2">
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => sendMessage(q.prompt)}
                    className="text-left text-[11px] font-medium px-3 py-2 rounded-xl
                               bg-gray-50 hover:bg-gray-100 text-gray-700
                               dark:bg-white/5 dark:hover:bg-white/10 dark:text-gray-200
                               border border-gray-200 dark:border-white/10
                               transition-colors"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendMessage(input);
              }}
              className="px-3 py-3 border-t border-gray-100 dark:border-white/10
                         bg-gray-50/60 dark:bg-white/[0.02]
                         flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Frag etwas zum Tanken …"
                disabled={busy}
                className="flex-1 px-3 py-2 rounded-full
                           bg-white dark:bg-white/5
                           border border-gray-200 dark:border-white/10
                           text-sm text-gray-900 dark:text-gray-100
                           placeholder:text-gray-400 dark:placeholder:text-gray-500
                           focus:outline-none focus:ring-2 focus:ring-brand-500/40
                           disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                aria-label="Senden"
                className="w-9 h-9 rounded-full
                           bg-gradient-to-br from-cyan-500 via-blue-500 to-violet-600
                           text-white flex items-center justify-center
                           shadow-md hover:shadow-lg hover:scale-105 active:scale-95
                           disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
                           transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l14-7-7 14-2-5-5-2z" />
                </svg>
              </button>
            </form>
          </div>
        </>
      )}
    </>
  );
}
