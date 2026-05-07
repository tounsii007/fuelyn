// ============================================================
// AI Fuel Advisor Service
// Calls GPT-4o-mini to produce intelligent refueling advice.
// Includes in-memory caching (15 min TTL) keyed by fuel type
// and rounded coordinates (~1 km precision).
// Server-side only.
// ============================================================

import { openai } from './openai-client';
import type { FuelType } from '@tankpilot/core';

// ---- Public Types ----

export interface AIAdvisorInput {
  currentPrices: {
    stationName: string;
    brand: string;
    price: number;
    distance: number;
  }[];
  fuelType: FuelType;
  priceHistory?: { price: number; timestamp: string }[];
  userContext?: {
    fillUpLiters?: number;
    vehicleConsumption?: number;
    dayOfWeek?: string;
    hourOfDay?: number;
  };
}

export interface AIAdvisorResponse {
  action: 'buy_now' | 'wait';
  headline: string;
  explanation: string;
  bestTimePrediction: string;
  savingsEstimate: number;
  confidence: 'high' | 'medium' | 'low';
  bestStation?: {
    name: string;
    reason: string;
  };
  priceOutlook: string;
  tip: string;
}

// ---- System Prompt ----

const SYSTEM_PROMPT = `Du bist ein KI-Tankberater für die App "TankPilot". Deine Aufgabe ist es, basierend auf aktuellen Preisdaten und Preistrends eine Tankempfehlung zu geben.

Antworte IMMER im folgenden JSON-Format:
{
  "action": "buy_now" | "wait",
  "headline": "...",
  "explanation": "...",
  "bestTimePrediction": "...",
  "savingsEstimate": 0.00,
  "confidence": "high" | "medium" | "low",
  "bestStation": { "name": "...", "reason": "..." },
  "priceOutlook": "...",
  "tip": "..."
}

Regeln:
- headline: Max 30 Zeichen, z.B. "Jetzt tanken!" oder "Noch warten!"
- explanation: 1-2 Sätze Erklärung
- bestTimePrediction: Wann ist der beste Zeitpunkt
- savingsEstimate: EUR Ersparnis bei der angegebenen Tankmenge (Standard 50L)
- confidence: Basierend auf Datenmenge und Trendklarheit
- bestStation: Die beste Tankstelle aus der Liste mit Begründung
- priceOutlook: 24h Preis-Ausblick
- tip: Praktischer Spar-Tipp
- Berücksichtige Wochentag-Muster (Di/Mi typischerweise günstiger, Fr/Sa teurer)
- Berücksichtige Tageszeit-Muster (18-20 Uhr oft günstiger, morgens teurer)
- Beziehe die Entfernung zur Tankstelle in die Empfehlung ein
- Rechne bei Umwegen den Mehrverbrauch mit ein
- Antworte NUR auf Deutsch
- Antworte NUR mit validem JSON, kein Markdown`;

// ---- In-Memory Cache ----

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface CacheEntry {
  response: AIAdvisorResponse;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function buildCacheKey(
  fuelType: FuelType,
  lat?: number,
  lng?: number,
): string {
  const latRound = lat != null ? lat.toFixed(2) : '0';
  const lngRound = lng != null ? lng.toFixed(2) : '0';
  return `${fuelType}:${latRound}:${lngRound}`;
}

function getCached(key: string): AIAdvisorResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.response;
}

function setCache(key: string, response: AIAdvisorResponse): void {
  // Evict expired entries periodically (simple sweep when cache grows)
  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now > v.expiresAt) cache.delete(k);
    }
  }
  cache.set(key, { response, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---- User Prompt Builder ----

function buildUserPrompt(input: AIAdvisorInput): string {
  const lines: string[] = [];

  lines.push(`Kraftstoff: ${input.fuelType.toUpperCase()}`);

  if (input.userContext?.dayOfWeek) {
    lines.push(`Wochentag: ${input.userContext.dayOfWeek}`);
  }
  if (input.userContext?.hourOfDay != null) {
    lines.push(`Uhrzeit: ${input.userContext.hourOfDay}:00`);
  }
  if (input.userContext?.fillUpLiters) {
    lines.push(`Tankmenge: ${input.userContext.fillUpLiters} Liter`);
  }
  if (input.userContext?.vehicleConsumption) {
    lines.push(
      `Fahrzeugverbrauch: ${input.userContext.vehicleConsumption} L/100km`,
    );
  }

  lines.push('');
  lines.push('Aktuelle Preise:');
  for (const s of input.currentPrices.slice(0, 15)) {
    lines.push(
      `- ${s.stationName} (${s.brand}): ${s.price.toFixed(3)} EUR, ${s.distance.toFixed(1)} km entfernt`,
    );
  }

  if (input.priceHistory && input.priceHistory.length > 0) {
    lines.push('');
    lines.push('Preisverlauf (letzte Datenpunkte):');
    // Send at most the last 20 history points to keep token usage low
    const recent = input.priceHistory.slice(-20);
    for (const h of recent) {
      const d = new Date(h.timestamp);
      const dayLabel = d.toLocaleDateString('de-DE', {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
      lines.push(`- ${dayLabel}: ${h.price.toFixed(3)} EUR`);
    }
  }

  return lines.join('\n');
}

// ---- Response Validation ----

function isValidResponse(obj: unknown): obj is AIAdvisorResponse {
  if (typeof obj !== 'object' || obj === null) return false;
  const r = obj as Record<string, unknown>;

  if (r.action !== 'buy_now' && r.action !== 'wait') return false;
  if (typeof r.headline !== 'string') return false;
  if (typeof r.explanation !== 'string') return false;
  if (typeof r.bestTimePrediction !== 'string') return false;
  if (typeof r.savingsEstimate !== 'number') return false;
  if (r.confidence !== 'high' && r.confidence !== 'medium' && r.confidence !== 'low') return false;
  if (typeof r.priceOutlook !== 'string') return false;
  if (typeof r.tip !== 'string') return false;

  return true;
}

function sanitizeResponse(raw: AIAdvisorResponse): AIAdvisorResponse {
  return {
    action: raw.action,
    headline: raw.headline.slice(0, 30),
    explanation: raw.explanation,
    bestTimePrediction: raw.bestTimePrediction,
    savingsEstimate: Math.round(raw.savingsEstimate * 100) / 100,
    confidence: raw.confidence,
    bestStation: raw.bestStation
      ? { name: raw.bestStation.name, reason: raw.bestStation.reason }
      : undefined,
    priceOutlook: raw.priceOutlook,
    tip: raw.tip,
  };
}

// ---- Main Service Function ----

export async function getAIAdvisorRecommendation(
  input: AIAdvisorInput,
  lat?: number,
  lng?: number,
): Promise<AIAdvisorResponse> {
  // 1. Check cache
  const cacheKey = buildCacheKey(input.fuelType, lat, lng);
  const cached = getCached(cacheKey);
  if (cached) {
    return cached;
  }

  // 2. Build prompts
  const userPrompt = buildUserPrompt(input);

  // 3. Call GPT-4o-mini
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 500,
  });

  // 4. Log cost estimate
  const usage = completion.usage;
  if (usage) {
    // GPT-4o-mini pricing: $0.15/1M input, $0.60/1M output tokens
    const inputCost = (usage.prompt_tokens / 1_000_000) * 0.15;
    const outputCost = (usage.completion_tokens / 1_000_000) * 0.60;
    const totalCost = inputCost + outputCost;
    console.log(
      `[AI Advisor] GPT-4o-mini call: ~${usage.total_tokens} tokens, est. cost: $${totalCost.toFixed(6)}`,
    );
  }

  // 5. Parse response
  const rawContent = completion.choices[0]?.message.content;
  if (!rawContent) {
    throw new Error('Empty response from OpenAI');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error('Invalid JSON response from OpenAI');
  }

  if (!isValidResponse(parsed)) {
    throw new Error('Response does not match expected schema');
  }

  const result = sanitizeResponse(parsed);

  // 6. Cache result
  setCache(cacheKey, result);

  return result;
}
