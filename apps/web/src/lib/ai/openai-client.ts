// ============================================================
// OpenAI Client Singleton
// Re-uses a single OpenAI instance across hot-reloads in dev.
// Server-side only -- never import this from client components.
// ============================================================

import OpenAI from 'openai';

const globalForOpenAI = globalThis as unknown as { openai: OpenAI };

export const openai =
  globalForOpenAI.openai ??
  new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForOpenAI.openai = openai;
}
