// ============================================================
// Price Intelligence — re-export from @fuelyn/core.
//
// The implementation lives in `packages/core/src/engine/price-intelligence.ts`
// as the single source of truth. This shim remains to preserve existing
// `@/lib/utils/price-intelligence` import paths across the web app.
// ============================================================

export {
  analyzePrices,
  fallbackRecommendation,
  getMockRecommendation,
  PRICE_INTELLIGENCE_DEFAULTS,
} from '@fuelyn/core';

export type {
  PriceRecommendation,
  PriceDataInput,
  Confidence,
  Action,
} from '@fuelyn/core';
