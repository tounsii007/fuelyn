// ============================================================
// Price Intelligence — re-export from @tankpilot/core.
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
} from '@tankpilot/core';

export type {
  PriceRecommendation,
  PriceDataInput,
  Confidence,
  Action,
} from '@tankpilot/core';
