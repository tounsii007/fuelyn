// ============================================================
// ChatInterface — message list + input for the AI assistant.
//
// Renders a Material/iOS-style messaging surface:
//   - Empty state with 4 suggested prompts the user can tap to
//     send straight away (lowers the cold-start friction)
//   - Scrolling message list, user-right / assistant-left
//   - Pending indicator (animated dots) below the last user msg
//   - Footer composer with Enter-to-send + multi-line Shift+Enter
//   - Auto-scroll to bottom on new messages so the latest reply
//     is always in view
// ============================================================

'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useChat, type ChatMessage } from '@/lib/hooks/use-chat';
import { useTranslations } from '@/lib/hooks/use-translations';

export function ChatInterface() {
  const { t } = useTranslations();
  const { messages, isPending, send, reset } = useChat();
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Suggested prompts only matter when the conversation is empty.
  // Memoised so swapping locales doesn't cost re-render churn
  // beyond what the t-function identity already triggers.
  const suggestions = useMemo(
    () => [
      t('aiChat.suggestionCheap'),
      t('aiChat.suggestionTime'),
      t('aiChat.suggestionRoute'),
      t('aiChat.suggestionEv'),
    ],
    [t],
  );

  // Pin the scroll to the bottom whenever messages change. Smooth
  // scroll is too jarring on mobile when the user is reading
  // mid-list, so we use 'auto' + only when we're near the bottom
  // to begin with (the user manually scrolled up to read history).
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isPending]);

  // Auto-grow the textarea up to ~6 lines, then internal scroll.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [draft]);

  const submit = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setDraft('');
      await send(trimmed);
    },
    [send],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(draft);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends. Shift+Enter inserts a newline. Standard chat
    // app convention; matches Slack/Discord/iMessage.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit(draft);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg)]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full
                       bg-gradient-to-br from-[var(--color-brand-500)] to-[var(--color-violet-500)]
                       text-white text-sm font-bold shadow-[var(--shadow-sm)]"
          >
            AI
          </span>
          <div>
            <h1 className="text-sm font-semibold text-[var(--color-fg)] leading-none">
              {t('aiChat.title')}
            </h1>
            <p className="text-[11px] text-[var(--color-fg-subtle)] mt-0.5">
              {t('aiChat.subtitle')}
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={reset}
            className="text-xs text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] px-2 py-1 rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            {t('aiChat.clearChat')}
          </button>
        )}
      </header>

      {/* Message list */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
        role="log"
        aria-live="polite"
        aria-label={t('aiChat.title')}
      >
        {messages.length === 0 ? (
          <EmptyState
            suggestions={suggestions}
            onPick={(s) => void submit(s)}
            t={t}
          />
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        {isPending && <PendingDots />}
      </div>

      {/* Composer */}
      <form
        onSubmit={onSubmit}
        className="border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-subtle)]/40 px-3 py-2 safe-bottom"
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={t('aiChat.placeholder')}
            aria-label={t('aiChat.placeholder')}
            disabled={isPending}
            className="flex-1 resize-none rounded-2xl border border-[var(--color-border)]
                       bg-[var(--color-surface)] px-3.5 py-2.5
                       text-sm text-[var(--color-fg)]
                       placeholder:text-[var(--color-fg-subtle)]
                       focus:border-[var(--color-brand-500)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]/20
                       disabled:opacity-60 transition-all"
          />
          <button
            type="submit"
            disabled={!draft.trim() || isPending}
            aria-label={t('aiChat.sendAria')}
            className="flex-shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full
                       bg-[var(--color-brand-600)] text-white shadow-[var(--shadow-sm)]
                       hover:bg-[var(--color-brand-700)] active:scale-95
                       disabled:opacity-40 disabled:cursor-not-allowed
                       transition-all"
          >
            <SendIcon />
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────

function EmptyState({
  suggestions,
  onPick,
  t,
}: {
  suggestions: readonly string[];
  onPick: (s: string) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center px-4">
      <div
        aria-hidden="true"
        className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl
                   bg-gradient-to-br from-[var(--color-brand-400)] via-[var(--color-brand-600)] to-[var(--color-violet-500)]
                   text-white text-xl font-bold shadow-[var(--shadow-glow-brand)]"
      >
        ✨
      </div>
      <h2 className="text-base font-semibold text-[var(--color-fg)] mb-1">
        {t('aiChat.emptyTitle')}
      </h2>
      <p className="text-xs text-[var(--color-fg-subtle)] max-w-sm leading-relaxed mb-6">
        {t('aiChat.emptyBody')}
      </p>
      <div className="grid w-full max-w-sm grid-cols-1 gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="text-left text-xs px-3 py-2.5 rounded-xl
                       bg-[var(--color-surface)] border border-[var(--color-border)]
                       text-[var(--color-fg)] hover:border-[var(--color-brand-400)]
                       hover:bg-[var(--color-brand-50)] dark:hover:bg-[var(--color-brand-900)]/20
                       transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const { t } = useTranslations();
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words',
          isUser
            ? 'bg-[var(--color-brand-600)] text-white rounded-br-sm shadow-[var(--shadow-sm)]'
            : 'bg-[var(--color-surface)] text-[var(--color-fg)] rounded-bl-sm border border-[var(--color-border)]',
        ].join(' ')}
      >
        {message.content}
        {message.source === 'fallback' && (
          <p className="mt-1.5 text-[10px] italic text-[var(--color-fg-subtle)] border-t border-[var(--color-border-subtle)] pt-1">
            {t('aiChat.fallbackHint')}
          </p>
        )}
      </div>
    </div>
  );
}

function PendingDots() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl rounded-bl-sm bg-[var(--color-surface)] border border-[var(--color-border)] px-3.5 py-2.5">
        <span className="inline-flex gap-1" aria-label="thinking">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-fg-subtle)] animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-fg-subtle)] animate-bounce" style={{ animationDelay: '120ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-fg-subtle)] animate-bounce" style={{ animationDelay: '240ms' }} />
        </span>
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m0 0l-6-6m6 6l-6 6" />
    </svg>
  );
}
