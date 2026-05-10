// ============================================================
// useChat — minimal chat state + send for the AI assistant.
//
// Holds the conversation in memory only (cleared on reload —
// there's no value in persisting since the LLM has no long-term
// memory anyway). Exposes the messages array, an inflight flag,
// and a send() function that:
//   1. Optimistically appends the user's message
//   2. POSTs the trimmed history (last 10 turns) to /api/ai/chat
//   3. Appends the assistant's reply on success
//   4. Appends an error notice on failure (so the user sees
//      that something went wrong instead of a silent freeze)
//
// History is trimmed at 20 messages (10 turns) so the request
// payload stays under the route's Zod validator cap and our
// LLM context stays tight.
// ============================================================

'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from './use-translations';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  readonly id: string;
  readonly role: ChatRole;
  readonly content: string;
  readonly timestamp: number;
  /** Marks server-side fallback responses so the UI can hint
   *  the user that the LLM is currently unavailable. */
  readonly source?: 'ollama' | 'fallback';
}

const MAX_HISTORY = 20;

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface UseChatReturn {
  readonly messages: readonly ChatMessage[];
  readonly isPending: boolean;
  readonly send: (content: string) => Promise<void>;
  readonly reset: () => void;
}

export function useChat(): UseChatReturn {
  const { locale, t } = useTranslations();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isPending, setIsPending] = useState(false);

  const reset = useCallback(() => {
    setMessages([]);
  }, []);

  const send = useCallback(
    async (content: string): Promise<void> => {
      const trimmed = content.trim();
      if (!trimmed || isPending) return;

      const userMsg: ChatMessage = {
        id: newId(),
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      };

      // Optimistic append, then send the trimmed history.
      setMessages((prev) => [...prev, userMsg]);
      setIsPending(true);

      try {
        // Send only the last MAX_HISTORY-1 messages (so the new
        // user message included makes MAX_HISTORY total) — keeps
        // the request body small and matches the route's Zod
        // validator cap.
        const history = [...messages.slice(-(MAX_HISTORY - 1)), userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history, locale }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data: { reply: string; source?: 'ollama' | 'fallback' } = await res.json();

        const reply: ChatMessage = {
          id: newId(),
          role: 'assistant',
          content: data.reply,
          timestamp: Date.now(),
          source: data.source,
        };
        setMessages((prev) => [...prev, reply]);
      } catch (err) {
        // Surface as an assistant message so the UI flow stays
        // intact — beats a separate banner the user has to dismiss.
        const errMsg: ChatMessage = {
          id: newId(),
          role: 'assistant',
          content: t('aiChat.errorReply'),
          timestamp: Date.now(),
          source: 'fallback',
        };
        setMessages((prev) => [...prev, errMsg]);
        // eslint-disable-next-line no-console
        console.error('[useChat] send failed:', err);
      } finally {
        setIsPending(false);
      }
    },
    [isPending, locale, messages, t],
  );

  return { messages, isPending, send, reset };
}
