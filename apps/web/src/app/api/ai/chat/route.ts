// ============================================================
// BFF — /api/ai/chat
//
// Conversational endpoint that proxies the user's message (plus
// recent conversation history) to the local Ollama LLM. Falls
// back to a tiny rules-based responder if Ollama is unreachable
// so the chat UI never goes silent.
//
// Design choices:
//   - Plain JSON request/response (not SSE-streamed) for round-1
//     simplicity. The chat UI can switch to streaming later by
//     consuming `/api/ai/chat/stream` if we add it; the protocol
//     here is forward-compatible (response shape stays).
//   - Direct call to Ollama from this BFF route, NOT through the
//     ai-service Java backend. Reason: ai-service is for
//     structured advisor-style enrichment. A free-form chat
//     would require new Java code, more containers in the
//     critical path, and offer no benefit since both BFF and
//     ai-service hit the same `ollama:11434`. Saves one hop.
//   - Server-side rate limit (10 msgs/min per IP) — same shape
//     as the advisor route.
//   - Hardcoded system prompt that locks the assistant to
//     fuel-related answers and the user's preferred language.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRateLimiter, getClientKey } from '@/lib/http/rate-limit';
import { parseJson } from '@/lib/http/validate';

// ─── Types ──────────────────────────────────────────────────

const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(2000),
});

const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1).max(20),
  /**
   * Active app locale so the assistant replies in the user's
   * language without us having to detect it from the message.
   * Falls back to 'de' which matches the app's default.
   */
  locale: z.enum(['de', 'en', 'en-US', 'fr']).default('de'),
});

type ChatRequest = z.infer<typeof ChatRequestSchema>;

interface OllamaResponse {
  message?: { role: string; content: string };
  done?: boolean;
  done_reason?: string;
}

// ─── Rate limiting ──────────────────────────────────────────

const rateLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

// ─── System prompt ──────────────────────────────────────────

const LANGUAGE_NAME: Record<ChatRequest['locale'], string> = {
  de: 'German',
  en: 'British English',
  'en-US': 'American English',
  fr: 'French',
};

function systemPrompt(locale: ChatRequest['locale']): string {
  return [
    `You are Fuelyn's friendly fuel-and-charging assistant for drivers in Germany.`,
    `Always answer in ${LANGUAGE_NAME[locale]}.`,
    `Stay focused on these topics: fuel prices (Diesel / Super E5 / Super E10), EV charging,`,
    `route planning, station opening hours, fuel-economy tips, and CO2 awareness.`,
    `If the user asks something off-topic, politely redirect to a fuel-related angle in one sentence.`,
    `Keep replies concise (2-4 sentences) unless the user asks for detail.`,
    `Never make up specific prices or station addresses — say you don't have that information instead.`,
    `Use a friendly, human tone. Avoid corporate-speak.`,
  ].join(' ');
}

// ─── Local fallback (Ollama down) ──────────────────────────

function localFallback(messages: ChatRequest['messages'], locale: ChatRequest['locale']): string {
  const lastUser = messages[messages.length - 1];
  if (!lastUser || lastUser.role !== 'user') {
    return locale === 'de'
      ? 'Hi! Wie kann ich dir beim Tanken oder Laden helfen?'
      : locale === 'fr'
        ? 'Bonjour ! Comment puis-je vous aider avec le carburant ou la recharge ?'
        : 'Hi! How can I help with fuel or charging?';
  }
  const q = lastUser.content.toLowerCase();
  // Tiny intent matcher — covers the most common question kinds
  // so the user gets SOMETHING when the LLM is offline.
  if (q.match(/\b(diesel|e5|e10|preis|price|prix)\b/)) {
    return locale === 'de'
      ? 'Schau auf die Karte — die günstigsten Tankstellen sind dort markiert. Aktuell ist mein KI-Modell offline; konkrete Preise siehst du im Hauptbildschirm.'
      : locale === 'fr'
        ? 'Consultez la carte — les stations les moins chères y sont marquées. Mon modèle IA est hors ligne ; les prix exacts sont sur l’écran principal.'
        : 'Check the map — the cheapest stations are marked there. My AI model is offline right now; exact prices are on the main screen.';
  }
  return locale === 'de'
    ? 'Mein KI-Modell ist gerade nicht erreichbar. Versuche es in einer Minute nochmal — oder schau dir auf der Karte die markierten Top-Deals an.'
    : locale === 'fr'
      ? 'Mon modèle IA n’est pas disponible pour le moment. Réessayez dans une minute — ou regardez les top deals sur la carte.'
      : 'My AI model isn’t reachable right now. Try again in a minute — or check the marked top deals on the map.';
}

// ─── Ollama call ────────────────────────────────────────────

async function callOllama(messages: ChatRequest['messages'], locale: ChatRequest['locale']): Promise<string> {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://ollama:11434';
  const model = process.env.OLLAMA_MODEL ?? 'qwen2.5:7b-instruct';

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt(locale) },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    stream: false,
    options: {
      temperature: 0.6,
      num_predict: 250, // ~250 tokens cap so a runaway reply can't burn budget
    },
  };

  // Hard 30 s timeout via AbortController — we don't want the chat
  // UI to hang forever if Ollama is slow-loading the model on a
  // cold start.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Ollama returned ${res.status}`);
    }

    const data = (await res.json()) as OllamaResponse;
    return (data.message?.content ?? '').trim();
  } finally {
    clearTimeout(timer);
  }
}

// ─── Route Handler ──────────────────────────────────────────

export async function POST(request: NextRequest) {
  // 1. Rate limiting
  const { limited, remaining, resetAt } = rateLimiter.check(getClientKey(request));
  const retryAfterSec = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  if (limited) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Max 10 messages per minute.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSec),
          'X-RateLimit-Limit': '10',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.floor(resetAt / 1000)),
        },
      },
    );
  }

  const responseHeaders = {
    'Cache-Control': 'private, no-store',
    'X-RateLimit-Limit': '10',
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.floor(resetAt / 1000)),
  };

  // 2. Parse + validate body via Zod
  const parsed = await parseJson(request, ChatRequestSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  // 3. Try Ollama, fall back gracefully so the UI never blanks
  try {
    const reply = await callOllama(body.messages, body.locale);
    if (!reply) throw new Error('Ollama returned empty content');
    return NextResponse.json({ reply, source: 'ollama' as const }, { headers: responseHeaders });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      '[AI Chat] Ollama unreachable, using local fallback:',
      error instanceof Error ? error.message : error,
    );
    const reply = localFallback(body.messages, body.locale);
    return NextResponse.json({ reply, source: 'fallback' as const }, { headers: responseHeaders });
  }
}
